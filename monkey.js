// ==UserScript==
// @name         华科课程平台刷课助手
// @namespace    http://tampermonkey.net/
// @version      0.0.4
// @description  华中科技大学课程平台刷课助手，点击右上角开始自动刷课，可以自动刷完所有视频｜https://github.com/Ozqi/HUST-Course-Helper
// @homepageURL  https://github.com/Ozqi/HUST-Course-Helper
// @supportURL   https://github.com/Ozqi/HUST-Course-Helper/issues
// @author       DavLiu
// @license      MIT
// @include        *://smartcourse.hust.edu.cn/*
// @include        *://smartcourse.hust.edu.cn/mooc-smartcourse/*
// @include        *://smartcourse.hust.edu.cn/mooc-smartcourse/mycourse/studentstudy*
// @match          *://smartcourse.hust.edu.cn/mycourse/*
// @include        *://localhost/*
// @include        *://127.0.0.1/*
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

    const DIRECT_COMPLETE_HOSTS = new Set(['localhost', '127.0.0.1', 'https://smartcourse.hust.edu.cn']); 
    let isAutoPlay = false;
    let mainTimer = null;
    let noTaskCounter = 0;
    let skipNonVideoTasks = localStorage.getItem('__skipNonVideoTasks') === 'true';
    // 新增：是否跳过平台已经打绿勾的视频，默认开启（常规逻辑）
    let skipFinishedVideos = localStorage.getItem('__skipFinishedVideos') !== 'false';
    let brushMode = localStorage.getItem('__brushMode') || 'safe2x';
    let videoLoadWaits = new WeakMap();
    let videoRecoveries = new WeakMap();

    function getStatusText(msg) {
        if (msg.includes('直接完成')) return '直接完成';
        if (msg.includes('初始化')) return '初始化';
        if (msg.includes('主框架')) return '等框架';
        if (msg.includes('视频拉取卡住')) return '视频拉取卡住';
        if (msg.includes('视频加载失败')) return '视频加载失败';
        if (msg.includes('自动切换线路')) return '切换线路';
        if (msg.includes('重载视频')) return '重载视频';
        if (msg.includes('刷新视频框架')) return '刷新框架';
        if (msg.includes('等待视频源')) return '等视频源';
        if (msg.includes('秒刷')) return '秒刷中';
        if (msg.includes('挂机')) return msg.includes('safe1x') ? '挂机·1x' : '挂机·2x';
        if (msg.includes('非视频任务') && msg.includes('跳过')) return '跳过任务';
        if (msg.includes('非视频任务')) return '待手动';
        if (msg.includes('验证')) return '验证中';
        if (msg.includes('本页任务')) return '切页中';
        if (msg.includes('同节下一标签')) return '下标签';
        if (msg.includes('下一小节')) return '下一节';
        if (msg.includes('全部刷完')) return '已完成';
        return msg.length > 6 ? msg.substring(0, 6) : msg;
    }

    function showLog(msg, isError = false) {
        console[isError ? 'error' : 'log']('【刷课助手】' + msg);
        const btn = document.querySelector('.video-helper-btn');
        if (btn && isAutoPlay) {
            btn.textContent = '⏸ ' + getStatusText(msg);
        }
    }

    function isStudyPage() {
        return DIRECT_COMPLETE_HOSTS.has(window.location.hostname) ||
            (window.location.href.includes('studentstudy') && !window.location.href.includes('login'));
    }

    function isDirectCompleteHost() {
        return DIRECT_COMPLETE_HOSTS.has(window.location.hostname);
    }

    function directCompleteFrame(frame) {
        try {
            frame.contentWindow.eval(`
                window.__inject_flag = true;
                window.__video_hacked = false;

                function directCompleteForLab() {
                    try {
                        if (typeof ed_complete === 'function') {
                            ed_complete();
                        }
                        if (typeof JC !== 'undefined' && JC && typeof JC.completed === 'function') {
                            JC.completed(0);
                        }
                        window.__video_hacked = true;
                        console.log('【刷课助手】直接完成');
                    } catch (e) {
                        setTimeout(directCompleteForLab, 1000);
                    }
                }
                directCompleteForLab();
            `);
            showLog('直接完成');
        } catch (e) {
            console.error('【刷课助手】直接完成失败:', e);
        }
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

        const modeNote = document.createElement('span');
        modeNote.innerText = '切换后刷新生效~注意不允许的视频用不了两倍速QAQ';
        modeNote.style.cssText = 'font-size: 10px; color: #666;';

        modeWrapper.appendChild(modeLabel);
        modeWrapper.appendChild(modeSelect);
        modeWrapper.appendChild(modeNote);
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
            videoLoadWaits = new WeakMap();
            videoRecoveries = new WeakMap();
            showLog('已开启，正在初始化...');
            runTaskLoop();
        } else {
            btn.innerHTML = '▶ 开始自动刷课';
            btn.style.background = '#4CAF50';
            clearTimeout(mainTimer);
            noTaskCounter = 0;
            videoLoadWaits = new WeakMap();
            videoRecoveries = new WeakMap();
            console.log('【刷课助手】已手动停止');
        }
    }

    function getVideoLoadState(frame) {
        try {
            const win = frame.contentWindow;
            const doc = win.document;
            const video = doc.querySelector('video');

            if (!video) {
                videoLoadWaits.delete(frame);
                return { status: 'waitingSource' };
            }

            if (video.error) {
                videoLoadWaits.delete(frame);
                return { status: 'error', error: video.error.code };
            }

            const hasSource = Boolean(video.currentSrc || video.src);
            const hasBuffered = video.buffered && video.buffered.length > 0;
            const hasMetadata = video.readyState >= 1 || Number.isFinite(video.duration);

            if (hasBuffered || hasMetadata) {
                videoLoadWaits.delete(frame);
                return { status: 'ready' };
            }

            if (hasSource && video.readyState === 0 && video.networkState === 2) {
                const waited = (videoLoadWaits.get(frame) || 0) + 2;
                videoLoadWaits.set(frame, waited);
                return { status: waited >= 8 ? 'stalled' : 'loading', waited };
            }

            return { status: hasSource ? 'loading' : 'waitingSource' };
        } catch (e) {
            videoLoadWaits.delete(frame);
            return { status: 'unknown' };
        }
    }

    function clickAlternateVideoLine(doc) {
        const radios = Array.from(doc.querySelectorAll('input[type="radio"]'));
        const target = radios.find((radio) => !radio.checked && !radio.disabled);

        if (!target) return false;

        target.click();
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function reloadVideo(frame) {
        const doc = frame.contentWindow.document;
        const video = doc.querySelector('video');

        if (video) {
            try {
                video.pause();
                video.load();
                video.play().catch(function () { });
                return true;
            } catch (e) { }
        }

        try {
            frame.contentWindow.location.reload();
            return true;
        } catch (e) {
            return false;
        }
    }

    function recoverVideoLoad(frame, reason) {
        let recovery = videoRecoveries.get(frame) || { count: 0, switchedLine: false };
        recovery.count += 1;

        try {
            const doc = frame.contentWindow.document;

            if (!recovery.switchedLine && clickAlternateVideoLine(doc)) {
                recovery.switchedLine = true;
                videoRecoveries.set(frame, recovery);
                videoLoadWaits.delete(frame);
                showLog('自动切换线路...');
                mainTimer = setTimeout(runTaskLoop, 5000);
                return true;
            }

            if (recovery.count <= 3 && reloadVideo(frame)) {
                videoRecoveries.set(frame, recovery);
                videoLoadWaits.delete(frame);
                showLog(reason === 'error' ? '重载视频...' : '视频拉取卡住，重载视频...');
                mainTimer = setTimeout(runTaskLoop, 5000);
                return true;
            }

            if (recovery.count <= 5) {
                videoRecoveries.set(frame, recovery);
                videoLoadWaits.delete(frame);
                frame.contentWindow.location.reload();
                showLog('刷新视频框架...');
                mainTimer = setTimeout(runTaskLoop, 7000);
                return true;
            }
        } catch (e) { }

        showLog('视频加载失败，请手动处理', true);
        mainTimer = setTimeout(runTaskLoop, 5000);
        return true;
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
                // 如果用户勾选了“跳过平台已完成”，并且平台标记为 finished，直接 continue 忽略它
                if (skipFinishedVideos && isFinishedByPlatform) continue;

                let isHackedByUs = false;
                try { isHackedByUs = frame.contentWindow.__video_hacked === true; } catch (e) { }

                if (!isHackedByUs) {
                    hasUnfinishedVideo = true;
                    const videoLoadState = getVideoLoadState(frame);

                    let isInjected = false;
                    try { isInjected = frame.contentWindow.__inject_flag === true; } catch (e) { }

                    if (!isInjected) {
                        if (isDirectCompleteHost()) {
                            directCompleteFrame(frame);
                        } else {
                            injectVideoHacker(frame);
                        }
                    }

                    if (isDirectCompleteHost()) {
                        continue;
                    }

                    if (videoLoadState.status === 'stalled') {
                        recoverVideoLoad(frame, 'stalled');
                        return;
                    }

                    if (videoLoadState.status === 'error') {
                        recoverVideoLoad(frame, 'error');
                        return;
                    }

                    if (videoLoadState.status === 'waitingSource') {
                        showLog('等待视频源...');
                        mainTimer = setTimeout(runTaskLoop, 2000);
                        return;
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
