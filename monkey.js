// ==UserScript==
// @name         华科课程平台刷课助手 (全功能可控版)
// @namespace    http://tampermonkey.net/
// @version      0.0.4
// @description  华中科技大学课程平台刷课助手，自定义跳过已完成任务，灵活补时长与秒刷切换
// @author       DavLiu
// @license      MIT
// @include        *://smartcourse.hust.edu.cn/*
// @include        *://smartcourse.hust.edu.cn/mooc-smartcourse/*
// @include        *://smartcourse.hust.edu.cn/mooc-smartcourse/mycourse/studentstudy*
// @match          *://smartcourse.hust.edu.cn/mycourse/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=hust.edu.cn
// @grant        none
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/522785/%E5%8D%8E%E7%A7%91%E8%AF%BE%E7%A8%8B%E5%B9%B3%E5%8F%B0%E5%88%B7%E8%AF%BE%E5%8A%A9%E6%89%8B.user.js
// @updateURL https://update.greasyfork.org/scripts/522785/%E5%8D%8E%E7%A7%91%E8%AF%BE%E7%A8%8B%E5%B9%B3%E5%8F%B0%E5%88%B7%E8%AF%BE%E5%8A%A9%E6%89%8B.meta.js
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self) {
        return;
    }

    let isAutoPlay = false;
    let mainTimer = null;
    let noTaskCounter = 0;
    let skipNonVideoTasks = localStorage.getItem('__skipNonVideoTasks') === 'true';
    // 新增：是否跳过平台已经打绿勾的视频，默认开启（常规逻辑）
    let skipFinishedVideos = localStorage.getItem('__skipFinishedVideos') !== 'false';
    let brushMode = localStorage.getItem('__brushMode') || 'safe2x';

    function showLog(msg, isError = false) {
        console[isError ? 'error' : 'log']('【刷课助手】' + msg);
        const btn = document.querySelector('.video-helper-btn');
        if (btn && isAutoPlay) {
            btn.innerHTML = '⏸ ' + msg.substring(0, 12) + '...';
        }
    }

    function isStudyPage() {
        return window.location.href.includes('studentstudy') && !window.location.href.includes('login');
    }

    function addControlPanel() {
        if (document.querySelector('.video-helper-panel')) return;
        if (!document.body) return;

        const panel = document.createElement('div');
        panel.className = 'video-helper-panel';
        panel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 99999;
            background: #ffffff;
            padding: 15px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15);
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-width: 210px;
            border: 1px solid #e0e0e0;
            font-family: Arial, sans-serif;
        `;

        const title = document.createElement('div');
        title.innerText = '华科刷课助手 v0.0.4';
        title.style.cssText = 'font-size: 14px; font-weight: bold; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;';
        panel.appendChild(title);

        const button = document.createElement('button');
        button.className = 'video-helper-btn';
        button.innerHTML = '▶ 开始自动刷课';
        button.style.cssText = `
            padding: 10px 15px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: background 0.3s ease;
            text-align: center;
        `;
        button.onclick = toggleAutoPlay;
        panel.appendChild(button);

        const modeWrapper = document.createElement('div');
        modeWrapper.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

        const modeLabel = document.createElement('span');
        modeLabel.innerText = '运行模式选择:';
        modeLabel.style.cssText = 'font-size: 12px; color: #666;';

        const modeSelect = document.createElement('select');
        modeSelect.style.cssText = 'padding: 4px; border-radius: 4px; border: 1px solid #ccc; font-size: 13px; cursor: pointer;';
        modeSelect.innerHTML = `
            <option value="safe2x" ${brushMode === 'safe2x' ? 'selected' : ''}>安全模式 (2倍速·挂时长)</option>
            <option value="safe1x" ${brushMode === 'safe1x' ? 'selected' : ''}>稳健模式 (1倍速·真实时长)</option>
            <option value="fast" ${brushMode === 'fast' ? 'selected' : ''}>秒刷模式 (注意！没时长)</option>
        `;
        modeSelect.onchange = (e) => {
            brushMode = e.target.value;
            localStorage.setItem('__brushMode', brushMode);
        };

        modeWrapper.appendChild(modeLabel);
        modeWrapper.appendChild(modeSelect);
        panel.appendChild(modeWrapper);

        // 配置项容器
        const configWrapper = document.createElement('div');
        configWrapper.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 4px;';

        // 配置 1：跳过已完成视频
        const skipVideoLabel = document.createElement('label');
        skipVideoLabel.style.cssText = 'font-size: 13px; color: #555; display: flex; align-items: center; cursor: pointer; user-select: none;';
        const skipVideoCheckbox = document.createElement('input');
        skipVideoCheckbox.type = 'checkbox';
        skipVideoCheckbox.style.cssText = 'margin-right: 8px; cursor: pointer;';
        skipVideoCheckbox.checked = skipFinishedVideos;
        skipVideoCheckbox.onchange = (e) => {
            skipFinishedVideos = e.target.checked;
            localStorage.setItem('__skipFinishedVideos', skipFinishedVideos);
            console.log('【刷课助手】跳过已完成视频选项更改为:', skipFinishedVideos);
        };
        skipVideoLabel.appendChild(skipVideoCheckbox);
        skipVideoLabel.appendChild(document.createTextNode('跳过平台已完成的视频'));
        configWrapper.appendChild(skipVideoLabel);

        // 配置 2：自动跳过测验
        const label = document.createElement('label');
        label.style.cssText = 'font-size: 13px; color: #555; display: flex; align-items: center; cursor: pointer; user-select: none;';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.style.cssText = 'margin-right: 8px; cursor: pointer;';
        checkbox.checked = skipNonVideoTasks;
        checkbox.onchange = (e) => {
            skipNonVideoTasks = e.target.checked;
            localStorage.setItem('__skipNonVideoTasks', skipNonVideoTasks);
        };
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode('遇到测验等自动跳过'));
        configWrapper.appendChild(label);

        panel.appendChild(configWrapper);
        document.body.appendChild(panel);
    }

    function toggleAutoPlay() {
        const btn = document.querySelector('.video-helper-btn');
        isAutoPlay = !isAutoPlay;

        if (isAutoPlay) {
            btn.style.background = '#f44336';
            noTaskCounter = 0;
            showLog('已开启，正在初始化...');
            runTaskLoop();
        } else {
            btn.innerHTML = '▶ 开始自动刷课';
            btn.style.background = '#4CAF50';
            clearTimeout(mainTimer);
            noTaskCounter = 0;
            console.log('【刷课助手】已手动停止');
        }
    }

    function injectVideoHacker(frame) {
        try {
            frame.contentWindow.eval(`
                window.__inject_flag = true;
                window.__video_hacked = false;
                
                function modifyPlayer() {
                    if(typeof videojs === 'undefined' || !videojs.getAllPlayers().length) {
                        setTimeout(modifyPlayer, 1000);
                        return;
                    }

                    const player = videojs.getAllPlayers()[0];
                    if(player) {
                        try {
                            player.muted(true);
                            player.play().catch(function(e){});
                        } catch(e) {}

                        let d = player.duration();
                        if (isNaN(d) || d <= 0) {
                            setTimeout(modifyPlayer, 1000);
                            return;
                        }

                        const mode = "${brushMode}";
                        if (mode === "fast") {
                            try {
                                player.currentTime(d);
                                player.trigger('ended');
                                player.reportProgress = function() {
                                    return { completed: true, duration: this.duration(), position: this.duration() };
                                };
                                if(typeof ed_complete === 'function') { setTimeout(ed_complete, 1000); }
                                window.__video_hacked = true;
                                console.log('【刷课助手】秒刷完成！');
                            } catch(e) { setTimeout(modifyPlayer, 1000); }
                        } else {
                            try {
                                const speed = mode === "safe2x" ? 2 : 1;
                                player.playbackRate(speed);
                                console.log('【刷课助手】防时长检测挂机中，速度: ' + speed + 'x');

                                player.on('ended', function() {
                                    window.__video_hacked = true;
                                    console.log('【刷课助手】本视频时长累加完毕');
                                });

                                const daemonTimer = setInterval(function() {
                                    if (player.ended() || player.currentTime() >= (d - 0.5)) {
                                        window.__video_hacked = true;
                                        clearInterval(daemonTimer);
                                        return;
                                    }
                                    if (player.paused() && !window.__video_hacked) {
                                        player.play().catch(function(e){});
                                    }
                                }, 1500);

                            } catch(e) { setTimeout(modifyPlayer, 1000); }
                        }
                    } else {
                        setTimeout(modifyPlayer, 1000);
                    }
                }
                modifyPlayer();
            `);
        } catch (e) {
            console.error('【刷课助手】跨域限制，注入失败:', e);
        }
    }

    function runTaskLoop() {
        if (!isAutoPlay) return;

        const mainFrame = document.getElementById('iframe');
        if (!mainFrame || !mainFrame.contentWindow || !mainFrame.contentWindow.document) {
            showLog('等待主框架加载中...');
            mainTimer = setTimeout(runTaskLoop, 2000);
            return;
        }

        const mainDoc = mainFrame.contentWindow.document;
        const innerFrames = Array.from(mainDoc.querySelectorAll('iframe'));

        let hasUnfinishedVideo = false;
        let hasOtherUnfinishedTasks = false;

        for (const frame of innerFrames) {
            const isVideo = frame.classList.contains('ans-insertvideo-online') || (frame.src && frame.src.includes('video'));

            const parentContainer = frame.closest('.ans-attach-ct') || frame.parentElement;
            const isJob = parentContainer && (parentContainer.querySelector('.ans-job-icon') || parentContainer.classList.contains('ans-job-icon') || parentContainer.classList.contains('ans-attach-ct'));
            const isFinishedByPlatform = parentContainer && parentContainer.classList.contains('ans-job-finished');

            if (isVideo) {
                // 核心修改：如果用户勾选了“跳过平台已完成”，并且平台标记为 finished，直接 continue 忽略它
                if (skipFinishedVideos && isFinishedByPlatform) continue;

                let isHackedByUs = false;
                try { isHackedByUs = frame.contentWindow.__video_hacked === true; } catch (e) { }

                if (!isHackedByUs) {
                    hasUnfinishedVideo = true;

                    let isInjected = false;
                    try { isInjected = frame.contentWindow.__inject_flag === true; } catch (e) { }

                    if (!isInjected) {
                        injectVideoHacker(frame);
                    }
                }
            } else {
                if (isJob && !isFinishedByPlatform) {
                    hasOtherUnfinishedTasks = true;
                }
            }
        }

        if (hasUnfinishedVideo) {
            noTaskCounter = 0;
            showLog(brushMode === 'fast' ? '正在秒刷视频...' : `挂机补时长中[${brushMode}]`);
            mainTimer = setTimeout(runTaskLoop, 2000);
        } else if (hasOtherUnfinishedTasks && !skipNonVideoTasks) {
            noTaskCounter = 0;
            showLog('遇到非视频任务');
            toggleAutoPlay();
            alert('【刷课助手】停！前面有测验题或者阅读任务，请手动完成后再点击继续！(你也可以在右上角勾选“自动跳过”)');
        } else {
            noTaskCounter += 2;
            if (noTaskCounter >= 6) {
                noTaskCounter = 0;
                showLog('本页任务处理完毕，切页...');
                goToNextNode();
            } else {
                if (hasOtherUnfinishedTasks && skipNonVideoTasks) {
                    showLog(`跳过非视频任务，稳定判定中(${6 - noTaskCounter}s)`);
                } else {
                    showLog(`未扫描到待处理视频，验证中(${6 - noTaskCounter}s)`);
                }
                mainTimer = setTimeout(runTaskLoop, 2000);
            }
        }
    }

    function goToNextNode() {
        if (!isAutoPlay) return;
        noTaskCounter = 0;

        const activeTab = document.querySelector('#prev_tab .prev_ul li.active');
        if (activeTab && activeTab.nextElementSibling) {
            showLog('切换同节下一标签...');
            activeTab.nextElementSibling.click();
            mainTimer = setTimeout(runTaskLoop, 4000);
            return;
        }

        const allNodes = Array.from(document.querySelectorAll('.posCatalog_name'));
        const activeNode = document.querySelector('.posCatalog_active .posCatalog_name') || document.querySelector('.posCatalog_active');

        if (allNodes.length > 0 && activeNode) {
            const currentIndex = allNodes.indexOf(activeNode);
            if (currentIndex !== -1 && currentIndex + 1 < allNodes.length) {
                showLog('切换下一小节...');
                allNodes[currentIndex + 1].click();
                mainTimer = setTimeout(runTaskLoop, 5000);
                return;
            }
        }

        showLog('全部刷完啦！');
        toggleAutoPlay();
        alert('🎉 恭喜！目录到底了，所有能刷的视频应该都刷完啦！记得完成中间可能跳过的测验！！');
    }

    function init() {
        if (!isStudyPage()) return;
        addControlPanel();
    }

    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            if (document.readyState === 'complete') init();
        }
    }).observe(document, { subtree: true, childList: true });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();