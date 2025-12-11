document.addEventListener('DOMContentLoaded', () => {
    // 获取当前执行的script标签
    const currentScript = document.currentScript || 
      document.querySelector('script[src*="chatbot.js"]');
    
    // 从data属性读取安全参数
    const config = {
      BOT_QQ: currentScript.dataset.botQq,
      BOT_NAME: currentScript.dataset.botName,
      WS_URL: currentScript.dataset.wsUrl,
      AUTH_API_URL: currentScript.dataset.authApiUrl 
    };
  
    // 验证必要参数
    if (!config.BOT_QQ || !config.WS_URL || !config.BOT_NAME) {
      console.error('缺失机器人必要配置参数');
      return;
    }

    // 使用配置参数
    const CHAT_ICON_SVG = 'https://cdn.ayakasuki.com/diy/static/chatbot/message.svg';
    
    // 全局状态
    let isAdminMode = false;
    let authToken = localStorage.getItem('auth_token');
    let userToken = localStorage.getItem('user_token');
    let currentUserId = localStorage.getItem('user_id');
    let currentAvatar = null;
    try {
        currentAvatar = JSON.parse(localStorage.getItem('user_avatar') || 'null');
    } catch (e) {
        currentAvatar = null;
    }
    let browserFingerprint = null;
    let isInitialized = false;
    let currentMasterQQ = null;

    // 生成浏览器指纹
    function generateBrowserFingerprint() {
        const components = [
            navigator.userAgent,
            navigator.language,
            screen.colorDepth,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset(),
            !!navigator.cookieEnabled,
            navigator.hardwareConcurrency || 'unknown',
            navigator.platform
        ];
        
        const data = components.join('|');
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }

    // 初始化用户会话
    async function initUserSession() {
        try {
            if (!browserFingerprint) {
                browserFingerprint = generateBrowserFingerprint();
            }
            
            const timestamp = Date.now();
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (userToken) {
                headers['x-auth-token'] = userToken;
            }
            
            console.log('正在初始化用户会话...', { 
                fingerprint: browserFingerprint, 
                timestamp: timestamp,
                hasToken: !!userToken 
            });
            
            const response = await fetch(`${config.AUTH_API_URL}/api/user/init`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ 
                    fingerprint: browserFingerprint, 
                    timestamp: timestamp 
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP错误: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('用户初始化响应:', data);
            
            if (data.success) {
                currentUserId = data.userId;
                currentAvatar = data.avatar;
                userToken = data.token;
                
                localStorage.setItem('user_token', userToken);
                localStorage.setItem('user_id', currentUserId);
                localStorage.setItem('user_avatar', JSON.stringify(currentAvatar));
                
                return {
                    success: true,
                    userId: currentUserId,
                    avatar: currentAvatar,
                    token: userToken,
                    isNew: data.isNew
                };
            }
            
            return { success: false, message: data.message || '用户初始化失败' };
        } catch (error) {
            console.error('用户初始化失败:', error);
            return { 
                success: false, 
                message: '网络请求失败: ' + error.message 
            };
        }
    }

    // 验证管理员令牌
    async function verifyAdminToken() {
        if (!authToken) return { valid: false };
        
        try {
            const response = await fetch(`${config.AUTH_API_URL}/auth/verify?token=${authToken}`);
            if (!response.ok) return { valid: false };
            
            const data = await response.json();
            if (data.valid) {
                isAdminMode = true;
                return { 
                    valid: true, 
                    account: data.account,
                    realMasterQQ: data.realMasterQQ 
                };
            }
        } catch (error) {
            console.error('管理员验证失败:', error);
        }
        
        localStorage.removeItem('auth_token');
        authToken = null;
        return { valid: false };
    }

    // 管理员登录
    async function adminLogin(account, password) {
        try {
            const response = await fetch(`${config.AUTH_API_URL}/auth/master`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ account, password })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP错误: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                authToken = data.token;
                localStorage.setItem('auth_token', authToken);
                isAdminMode = true;
                
                return { 
                    success: true, 
                    token: authToken,
                    realMasterQQ: data.realMasterQQ 
                };
            }
            
            return { success: false, message: data.message || '账号或密码错误' };
        } catch (error) {
            console.error('管理员登录失败:', error);
            return { 
                success: false, 
                message: '登录失败: ' + error.message 
            };
        }
    }

    // 管理员注销
    function adminLogout() {
        if (authToken) {
            fetch(`${config.AUTH_API_URL}/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: authToken })
            }).catch(error => console.error('注销请求失败:', error));
        }
        
        authToken = null;
        isAdminMode = false;
        localStorage.removeItem('auth_token');
    }

    // 创建UI元素
    const chatIcon = document.createElement('div');
    chatIcon.id = 'chatIcon';
    
    const svgIcon = document.createElement('img');
    svgIcon.src = CHAT_ICON_SVG;
    svgIcon.alt = '聊天图标';
    svgIcon.className = 'chat-svg-icon';
    chatIcon.appendChild(svgIcon);
    
    document.body.appendChild(chatIcon);
    
    const bubbleTip = document.createElement('div');
    bubbleTip.className = 'bubble-tip';
    bubbleTip.innerHTML = '好无聊~ ╮(╯▽╰)╭<br/>快点击信息框来找桃妹聊天吧！';
    chatIcon.appendChild(bubbleTip);
    
    let bubbleTimer = null;
    let bubbleVisible = false;
    
    function showBubble() {
        const isChatClosed = chatWindow.style.display !== 'flex';
        
        if (!bubbleVisible && isChatClosed) {
            bubbleTip.style.display = 'block';
            bubbleVisible = true;
            
            setTimeout(() => {
                if (bubbleVisible) {
                    bubbleTip.style.display = 'none';
                    bubbleVisible = false;
                }
            }, 10000);
        }
    }
    
    bubbleTip.addEventListener('click', () => {
        bubbleTip.style.display = 'none';
        bubbleVisible = false;
        
        clearInterval(bubbleTimer);
        bubbleTimer = setInterval(showBubble, 120000);
    });
    
    bubbleTimer = setInterval(showBubble, 120000);
    
    const chatWindow = document.createElement('div');
    chatWindow.id = 'chatWindow';
    document.body.appendChild(chatWindow);
    
    function initChatSystem() {
        const { BOT_QQ, BOT_NAME, WS_URL } = config;
        
        // 添加窗口大小调整手柄
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        chatWindow.appendChild(resizeHandle);
        
        // 头部区域
        const header = document.createElement('div');
        header.className = 'chat-header';
        
        const titleContainer = document.createElement('div');
        titleContainer.className = 'header-title-container';
        
        const title = document.createElement('h3');
        title.textContent = `这是你的${BOT_NAME}呀~`;
        titleContainer.appendChild(title);
        
        header.appendChild(titleContainer);
        
        const statusIndicator = document.createElement('div');
        statusIndicator.id = 'statusIndicator';
        statusIndicator.textContent = '● 离线';
        
        const adminEntryButton = document.createElement('div');
        adminEntryButton.className = 'admin-entry-button';
        adminEntryButton.innerHTML = '管理入口';
        adminEntryButton.title = '点击进入管理员登录界面';
        
        const headerControls = document.createElement('div');
        headerControls.className = 'header-controls';
        headerControls.appendChild(statusIndicator);
        headerControls.appendChild(adminEntryButton);
        
        header.appendChild(headerControls);
        
        // 消息区域
        const messageArea = document.createElement('div');
        messageArea.id = 'messageArea';
        
        // 用户登录表单
        const userLoginForm = document.createElement('div');
        userLoginForm.className = 'user-login-form';
        userLoginForm.style.display = 'none';
        
        const userLoginMessage = document.createElement('div');
        userLoginMessage.className = 'login-message';
        userLoginMessage.textContent = '正在初始化用户会话...';
        userLoginForm.appendChild(userLoginMessage);
        
        const loginSpinner = document.createElement('div');
        loginSpinner.className = 'login-spinner';
        userLoginForm.appendChild(loginSpinner);
        
        // 管理员登录表单
        const adminLoginForm = document.createElement('div');
        adminLoginForm.className = 'admin-login-form';
        adminLoginForm.style.display = 'none';
        
        const adminLoginTitle = document.createElement('h4');
        adminLoginTitle.textContent = '管理员登录';
        adminLoginTitle.style.margin = '0 0 15px 0';
        adminLoginTitle.style.color = '#333';
        adminLoginTitle.style.fontSize = '16px';
        adminLoginTitle.style.fontWeight = '600';
        adminLoginForm.appendChild(adminLoginTitle);
        
        const adminAccountInput = document.createElement('input');
        adminAccountInput.className = 'admin-input';
        adminAccountInput.placeholder = '超管账号';
        adminAccountInput.id = 'adminAccountInput';
        adminAccountInput.type = 'text';
        adminAccountInput.style.padding = '10px 15px';
        adminAccountInput.style.marginBottom = '10px';
        adminAccountInput.style.border = '1px solid #ddd';
        adminAccountInput.style.borderRadius = '20px';
        adminAccountInput.style.width = '80%';
        adminAccountInput.style.maxWidth = '200px';
        adminAccountInput.style.textAlign = 'center';
        adminAccountInput.style.fontSize = '14px';
        adminAccountInput.style.outline = 'none';
        
        const adminPasswordInput = document.createElement('input');
        adminPasswordInput.type = 'password';
        adminPasswordInput.className = 'admin-input';
        adminPasswordInput.placeholder = '超管密码';
        adminPasswordInput.id = 'adminPasswordInput';
        adminPasswordInput.style.padding = '10px 15px';
        adminPasswordInput.style.marginBottom = '10px';
        adminPasswordInput.style.border = '1px solid #ddd';
        adminPasswordInput.style.borderRadius = '20px';
        adminPasswordInput.style.width = '80%';
        adminPasswordInput.style.maxWidth = '200px';
        adminPasswordInput.style.textAlign = 'center';
        adminPasswordInput.style.fontSize = '14px';
        adminPasswordInput.style.outline = 'none';
        
        const adminLoginButton = document.createElement('button');
        adminLoginButton.className = 'admin-login-button';
        adminLoginButton.textContent = '管理员登录';
        adminLoginButton.style.padding = '10px 20px';
        adminLoginButton.style.background = 'linear-gradient(45deg, #ef71aa, #ff6b6b)';
        adminLoginButton.style.color = 'white';
        adminLoginButton.style.border = 'none';
        adminLoginButton.style.borderRadius = '20px';
        adminLoginButton.style.cursor = 'pointer';
        adminLoginButton.style.fontWeight = 'bold';
        adminLoginButton.style.marginTop = '10px';
        adminLoginButton.style.width = '80%';
        adminLoginButton.style.maxWidth = '200px';
        adminLoginButton.style.fontSize = '14px';
        adminLoginButton.style.transition = 'all 0.3s';
        
        const adminLoginMessage = document.createElement('div');
        adminLoginMessage.className = 'admin-login-message';
        adminLoginMessage.textContent = '请输入超管账号和密码以进行管理员登录';
        adminLoginMessage.style.color = '#666';
        adminLoginMessage.style.fontSize = '12px';
        adminLoginMessage.style.textAlign = 'center';
        adminLoginMessage.style.marginTop = '10px';
        adminLoginMessage.style.padding = '5px';
        adminLoginMessage.style.borderRadius = '5px';
        adminLoginMessage.style.width = '100%';
        adminLoginMessage.style.lineHeight = '1.4';
        
        adminLoginForm.appendChild(adminAccountInput);
        adminLoginForm.appendChild(adminPasswordInput);
        adminLoginForm.appendChild(adminLoginButton);
        adminLoginForm.appendChild(adminLoginMessage);
        
        // 聊天界面
        const chatInterface = document.createElement('div');
        chatInterface.className = 'chat-interface';
        chatInterface.style.display = 'none';
        chatInterface.style.flexDirection = 'column';
        chatInterface.style.alignItems = 'center';
        chatInterface.style.justifyContent = 'center';
        chatInterface.style.padding = '20px';
        chatInterface.style.textAlign = 'center';
        
        const botAvatarContainer = document.createElement('div');
        botAvatarContainer.className = 'bot-avatar-container';
        botAvatarContainer.style.display = 'flex';
        botAvatarContainer.style.justifyContent = 'center';
        botAvatarContainer.style.margin = '0 0 20px 0';
        botAvatarContainer.style.width = '100%';
        botAvatarContainer.style.flexDirection = 'column';
        botAvatarContainer.style.alignItems = 'center';
        
        const botAvatar = document.createElement('img');
        botAvatar.className = 'bot-avatar';
        botAvatar.src = `https://q.qlogo.cn/g?b=qq&s=0&nk=${BOT_QQ}`;
        botAvatar.alt = `${BOT_NAME}头像`;
        botAvatar.style.width = '100px';
        botAvatar.style.height = '100px';
        botAvatar.style.borderRadius = '50%';
        botAvatar.style.border = '3px solid #ef71aa';
        botAvatar.style.objectFit = 'cover';
        botAvatar.style.display = 'block';
        botAvatar.style.margin = '0 auto 10px';
        
        const welcomeMessage = document.createElement('div');
        welcomeMessage.className = 'welcome-message';
        welcomeMessage.innerHTML = `
            <p>欢迎回来~桃妹的原型是胡桃，直接与我对话是用大模型对话哦，可能会慢一点，请稍等就好，更多机器人功能请输入#帮助</p>
        `;
        welcomeMessage.style.fontSize = '12px';
        welcomeMessage.style.color = '#666';
        welcomeMessage.style.textAlign = 'center';
        welcomeMessage.style.padding = '10px';
        welcomeMessage.style.margin = '0 20px';
        welcomeMessage.style.borderRadius = '10px';
        welcomeMessage.style.lineHeight = '1.5';
        welcomeMessage.style.background = 'rgba(0,0,0,0.05)';
        
        botAvatarContainer.appendChild(botAvatar);
        chatInterface.appendChild(botAvatarContainer);
        chatInterface.appendChild(welcomeMessage);
        
        // 输入区域
        const inputGroup = document.createElement('div');
        inputGroup.className = 'input-group';
        inputGroup.style.display = 'none';
        
        const messageInput = document.createElement('input');
        messageInput.className = 'message-input';
        messageInput.placeholder = '发送消息给机器人...';
        messageInput.id = 'chatMessageInput';
        messageInput.name = 'message';
        messageInput.autocomplete = 'off';
        
        const sendButton = document.createElement('button');
        sendButton.className = 'send-button';
        sendButton.textContent = '发送';
        
        const adminModeBadge = document.createElement('div');
        adminModeBadge.className = 'admin-mode-badge';
        adminModeBadge.textContent = '管理员模式';
        adminModeBadge.style.display = 'none';
        
        inputGroup.appendChild(messageInput);
        inputGroup.appendChild(sendButton);
        inputGroup.appendChild(adminModeBadge);
        
        // 添加所有元素到窗口
        chatWindow.appendChild(header);
        chatWindow.appendChild(messageArea);
        messageArea.appendChild(userLoginForm);
        messageArea.appendChild(adminLoginForm);
        messageArea.appendChild(chatInterface);
        chatWindow.appendChild(inputGroup);
        
        let socket = null;
        let heartbeatTimer = null;
        let reconnectAttempts = 0;
        const MAX_RECONNECT_ATTEMPTS = 5;
        let messageCounter = 100000;
        let connectionState = 'disconnected';
        
        // 打字指示器和超时器
        let typingIndicators = {};
        let typingTimeouts = {};
        
        // 更新状态显示
        function updateStatus(text, color) {
            statusIndicator.innerHTML = `● ${text}`;
            statusIndicator.style.color = color;
            connectionState = text.toLowerCase();
            console.log(`[STATUS] 连接状态更新: ${text}`);
        }

        // 添加消息到聊天区域
        function addMessage(content, sender, type = 'text') {
            const container = document.createElement('div');
            container.className = `message-container ${sender}`;
            
            const avatarContainer = document.createElement('div');
            avatarContainer.className = 'avatar-container';
            
            const avatar = document.createElement('img');
            avatar.className = 'avatar-img';
            
            if (sender === 'user') {
                if (currentAvatar && currentAvatar.url) {
                    avatar.src = currentAvatar.url;
                } else {
                    avatar.src = 'https://q.qlogo.cn/g?b=qq&s=0&nk=0';
                }
            } else {
                avatar.src = `https://q.qlogo.cn/g?b=qq&s=0&nk=${BOT_QQ}`;
            }
            
            avatarContainer.appendChild(avatar);
            container.appendChild(avatarContainer);
            
            const contentContainer = document.createElement('div');
            contentContainer.className = 'content-container';

            if (isAdminMode && sender === 'user') {
                const badge = document.createElement('span');
                badge.className = 'admin-badge';
                badge.textContent = '管理员';
                badge.style.position = 'absolute';
                badge.style.top = '-5px';
                badge.style.right = '-5px';
                badge.style.background = 'linear-gradient(45deg, #ef71aa, #ff6b6b)';
                badge.style.color = 'white';
                badge.style.fontSize = '10px';
                badge.style.padding = '2px 6px';
                badge.style.borderRadius = '10px';
                badge.style.zIndex = '10';
                badge.style.whiteSpace = 'nowrap';
                badge.style.fontWeight = 'bold';
                badge.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                avatarContainer.appendChild(badge);
            }
            
            if (type === 'text') {
                const bubble = document.createElement('div');
                bubble.className = 'message-bubble';
                
                const lines = content.split('\n');
                lines.forEach((line, index) => {
                    bubble.appendChild(document.createTextNode(line));
                    if (index < lines.length - 1) {
                        bubble.appendChild(document.createElement('br'));
                    }
                });
                
                contentContainer.appendChild(bubble);
            } 
            else if (type === 'image') {
                const img = document.createElement('img');
                img.className = 'message-image fancybox';
                img.dataset.fancybox = "gallery";
                
                if (content.startsWith('http://') || content.startsWith('https://') || 
                    content.startsWith('/') || content.startsWith('./') || content.startsWith('../')) {
                    img.src = content;
                } else if (content.startsWith('base64://')) {
                    const base64Data = content.replace('base64://', '');
                    img.src = `data:image/png;base64,${base64Data}`;
                } else {
                    console.warn('无法识别的图片格式:', content);
                    img.src = '';
                }
                
                contentContainer.appendChild(img);
            }
            
            // 延迟绑定Fancybox
            setTimeout(() => {
                const robotImages = document.querySelectorAll('.message-container.robot .fancybox');
                robotImages.forEach(img => {
                    img.addEventListener('dblclick', () => {
                        if (window.Fancybox) {
                            Fancybox.show([{ src: img.src }], { groupAll: true });
                        }
                    });
                });
            }, 0);
            
            container.appendChild(contentContainer);
            messageArea.appendChild(container);
            messageArea.scrollTop = messageArea.scrollHeight;
        }
        
        // 添加打字指示器
        function addTypingIndicator(messageId) {
            const container = document.createElement('div');
            container.id = `typing-indicator-${messageId}`;
            container.className = 'message-container robot';
            
            const avatarContainer = document.createElement('div');
            avatarContainer.className = 'avatar-container';
            
            const avatar = document.createElement('img');
            avatar.className = 'avatar-img';
            avatar.src = `https://q.qlogo.cn/g?b=qq&s=0&nk=${config.BOT_QQ}`;
            avatarContainer.appendChild(avatar);
            container.appendChild(avatarContainer);
            
            const contentContainer = document.createElement('div');
            contentContainer.className = 'content-container';
            
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble typing-indicator';
            
            for (let i = 0; i < 3; i++) {
                const dot = document.createElement('span');
                dot.className = 'typing-dot';
                dot.style.display = 'inline-block';
                dot.style.width = '8px';
                dot.style.height = '8px';
                dot.style.borderRadius = '50%';
                dot.style.margin = '0 3px';
                dot.style.background = '#a0a0a0';
                dot.style.animation = 'typing-dot 1.4s infinite ease-in-out both';
                bubble.appendChild(dot);
            }
            
            contentContainer.appendChild(bubble);
            container.appendChild(contentContainer);
            messageArea.appendChild(container);
            messageArea.scrollTop = messageArea.scrollHeight;
            
            typingTimeouts[messageId] = setTimeout(() => {
                removeTypingIndicator(messageId);
                addSystemMessage('服务可能繁忙，可能会更长时间才能得到回复。请稍等，也可重复发送信息~');
            }, 120000);
            
            return container.id;
        }
        
        // 移除打字指示器
        function removeTypingIndicator(messageId) {
            const indicatorId = typingIndicators[messageId];
            if (indicatorId) {
                const indicator = document.getElementById(indicatorId);
                if (indicator) {
                    indicator.remove();
                }
                delete typingIndicators[messageId];
            }
            
            if (typingTimeouts[messageId]) {
                clearTimeout(typingTimeouts[messageId]);
                delete typingTimeouts[messageId];
            }
        }
        
        // 添加系统消息
        function addSystemMessage(text) {
            const sysMsg = document.createElement('div');
            sysMsg.className = 'system-message';
            sysMsg.innerHTML = text;
            messageArea.appendChild(sysMsg);
            messageArea.scrollTop = messageArea.scrollHeight;
            console.log(`[SYSTEM] ${text}`);
        }
        
        // 停止心跳
        function stopHeartbeat() {
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }
        }
        
        // 发送心跳
        function sendHeartbeat() {
            if (!socket || socket.readyState !== WebSocket.OPEN) return;
            
            try {
                const heartbeatPayload = {
                    "post_type": "meta_event",
                    "meta_event_type": "heartbeat",
                    "self_id": BOT_QQ,
                    "time": Math.floor(Date.now() / 1000),
                    "interval": 15000,
                    "status": {
                        "app_initialized": true,
                        "app_enabled": true,
                        "plugins_good": true,
                        "app_good": true,
                        "online": true
                    }
                };
                
                socket.send(JSON.stringify(heartbeatPayload));
            } catch (e) {
                console.warn('[HEARTBEAT] 心跳发送失败:', e);
                handleReconnect();
            }
        }
        
        // 连接WebSocket
        function connectWebSocket() {
            if (socket && (socket.readyState === WebSocket.OPEN || 
                           socket.readyState === WebSocket.CONNECTING)) {
                return;
            }
            
            updateStatus('连接中...', '#ff9800');
            addSystemMessage('正在建立连接...');
            
            try {
                if (socket) {
                    socket.close();
                    socket = null;
                }
                
                socket = new WebSocket(WS_URL);
                
                socket.onopen = () => {
                    updateStatus('在线', '#4CAF50');
                    addSystemMessage('连接建立成功');
                    reconnectAttempts = 0;
                    
                    const authPayload = {
                        "post_type": "meta_event",
                        "meta_event_type": "lifecycle",
                        "sub_type": "connect",
                        "self_id": BOT_QQ,
                        "time": Math.floor(Date.now() / 1000),
                        "version": {
                            "app_name": "Web-Onebot-link",
                            "app_version": "1.0.0",
                            "protocol_version": "v11"
                        }
                    };
                    
                    console.log('[AUTH] 发送认证信息', authPayload);
                    socket.send(JSON.stringify(authPayload));
                    
                    stopHeartbeat();
                    heartbeatTimer = setInterval(sendHeartbeat, 15000);
                };
                
                // API请求处理器
                function handleApiRequest(request) {
                    const response = {
                        status: "ok",
                        retcode: 0,
                        echo: request.echo,
                        data: null
                    };

                    switch (request.action) {
                        case "get_login_info":
                            console.log("[API] 响应get_login_info");
                            response.data = {
                                user_id: BOT_QQ,
                                nickname: BOT_NAME
                            };
                            break;
                            
                        case "get_version_info":
                            console.log("[API] 响应get_version_info");
                            response.data = {
                                app_name: "Web-Onebot-link",
                                app_version: "1.0.0",
                                protocol_version: "v11"
                            };
                            break;
                            
                        case "get_friend_list":
                            console.log("[API] 响应get_friend_list");
                            response.data = [
                                {
                                    user_id: isAdminMode ? currentMasterQQ : (currentUserId || 'anonymous'),
                                    nickname: isAdminMode ? "管理员" : "用户",
                                    remark: ""
                                }
                            ];
                            break;
                            
                        case "get_group_list":
                            console.log("[API] 响应get_group_list");
                            response.data = [];
                            break;
                            
                        case "_set_model_show":
                            console.log("[API] 响应_set_model_show");
                            response.data = { result: true };
                            break;
                    }
                            
                    try {
                        socket.send(JSON.stringify(response));
                        console.log('[SEND] API响应:', response);
                    } catch (e) {
                        console.error('[ERROR] API响应发送失败:', e);
                    }
                }
                
                // 消息接收处理器
                socket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        console.log('[RECV] 收到消息', data);
                        
                        const messageIds = Object.keys(typingIndicators);
                        if (messageIds.length > 0) {
                            const oldestMessageId = messageIds[0];
                            removeTypingIndicator(oldestMessageId);
                        }
                        
                        if (data.echo) {
                            handleApiRequest(data);
                        }
                        
                        if (data.meta_event_type === 'heartbeat') {
                            console.log('[HEARTBEAT] 收到心跳响应');
                            return;
                        }
                        
                        if (data.action === 'send_private_forward_msg' && data.params) {
                            addForwardMessage(data.params.messages);
                        }
                        
                        if (data.action === 'send_msg' && data.params) {
                            const messageArray = data.params.message;
                            if (Array.isArray(messageArray)) {
                                messageArray.forEach(segment => {
                                    if (segment.type === 'text') {
                                        addMessage(segment.data.text, 'robot');
                                    } else if (segment.type === 'image') {
                                        const imgContent = segment.data.file || '';
                                        addMessage(imgContent, 'robot', 'image');
                                    }
                                });
                            } else if (typeof messageArray === 'string') {
                                addMessage(messageArray, 'robot');
                            }
                        }
                        else if (data.post_type === 'message' && data.message_type === 'private') {
                            let messageText = '';
                            if (Array.isArray(data.message)) {
                                messageText = data.message.map(segment => {
                                    if (segment.type === 'text') return segment.data.text;
                                    if (segment.type === 'image') return '[图片]';
                                    if (segment.type === 'face') return '[表情]';
                                    return `[${segment.type}]`;
                                }).join('');
                            } else if (typeof data.message === 'string') {
                                messageText = data.message;
                            }
                            addMessage(messageText, 'robot');
                        }
                    } catch (e) {
                        console.error('[ERROR] 消息解析失败:', e);
                    }
                };
                
                socket.onerror = (error) => {
                    console.error('[ERROR] WebSocket错误:', error);
                    updateStatus('错误', '#f44336');
                    addSystemMessage('连接发生错误');
                    stopHeartbeat();
                };
                
                socket.onclose = (event) => {
                    updateStatus('离线', '#ff4d4d');
                    addSystemMessage(`连接已断开 (代码: ${event.code}, 原因: ${event.reason || '无'})`);
                    stopHeartbeat();
                    
                    Object.keys(typingIndicators).forEach(removeTypingIndicator);
                    typingIndicators = {};
                    typingTimeouts = {};
                    
                    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts));
                        reconnectAttempts++;
                        addSystemMessage(`将在 ${delay/1000} 秒后尝试重新连接...`);
                        
                        setTimeout(() => {
                            if (connectionState !== 'connecting') {
                                connectWebSocket();
                            }
                        }, delay);
                    } else {
                        addSystemMessage('重连次数已达上限，请手动重试');
                    }
                };
                
            } catch (e) {
                console.error('[ERROR] 创建WebSocket失败:', e);
                updateStatus('错误', '#f44336');
                addSystemMessage('连接创建失败');
                handleReconnect();
            }
        }
        
        // 处理重连
        function handleReconnect() {
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = 3000;
                reconnectAttempts++;
                addSystemMessage(`将在 ${delay/1000} 秒后尝试重新连接...`);
                setTimeout(connectWebSocket, delay);
            } else {
                addSystemMessage('重连次数已达上限，请手动重试');
            }
        }
        
        // 发送消息
        function sendMessage() {
            const message = messageInput.value.trim();
            if (!message || !socket) return;
            
            const messageId = messageCounter++;
            
            addMessage(message, 'user');
            
            const indicatorId = addTypingIndicator(messageId);
            typingIndicators[messageId] = indicatorId;
            
            if (socket.readyState === WebSocket.OPEN) {
                try {
                    const eventPayload = {
                        "post_type": "message",
                        "message_type": "private",
                        "sub_type": "friend",
                        "message_id": messageId,
                        "user_id": isAdminMode ? currentMasterQQ : currentUserId,
                        "self_id": BOT_QQ,
                        "message": [
                            {
                                "type": "text",
                                "data": {"text": message}
                            }
                        ],
                        "raw_message": message,
                        "font": 0,
                        "sender": {
                            "user_id": isAdminMode ? currentMasterQQ : currentUserId,
                            "nickname": isAdminMode ? "管理员" : "用户",
                            "sex": "unknown",
                            "age": 0
                        },
                        "time": Math.floor(Date.now() / 1000)
                    };
                    
                    console.log('[SEND] 发送消息事件:', eventPayload);
                    socket.send(JSON.stringify(eventPayload));
                    messageInput.value = '';
                } catch (e) {
                    console.error('[ERROR] 消息发送失败:', e);
                    addSystemMessage('消息发送失败');
                }
            } else {
                addSystemMessage('机器人未连接，消息发送失败');
                connectWebSocket();
            }
        }
        
        // 初始化用户
        async function initializeUser() {
    try {
        addSystemMessage('正在初始化聊天系统...');
        
        // 首先尝试验证管理员令牌
        if (authToken) {
            addSystemMessage('检测到管理员令牌，正在验证...');
            const verifyResult = await verifyAdminToken();
            if (verifyResult.valid) {
                isAdminMode = true;
                currentMasterQQ = verifyResult.realMasterQQ;
                adminModeBadge.style.display = 'block';
                addSystemMessage(`检测到有效管理员令牌，已进入管理员模式`);
                
                // 使用管理员身份
                userLoginForm.style.display = 'none';
                adminLoginForm.style.display = 'none';
                chatInterface.style.display = 'flex';
                inputGroup.style.display = 'flex';
                connectWebSocket();
                return;
            } else {
                addSystemMessage('管理员令牌已失效，切换到普通用户模式');
                authToken = null;
                localStorage.removeItem('auth_token');
            }
        }
        
        // 普通用户初始化
        addSystemMessage('正在初始化用户会话...');
        userLoginForm.style.display = 'flex';
        chatInterface.style.display = 'none';
        adminLoginForm.style.display = 'none';
        
        const result = await initUserSession();
        
        if (result.success) {
            if (result.isNew) {
                addSystemMessage(`欢迎新用户！您的用户ID: ${result.userId}`);
            } else {
                addSystemMessage(`检测到现有会话，正在恢复...`);
                addSystemMessage(`欢迎回来！用户ID: ${result.userId}`);
            }
            
            userLoginForm.style.display = 'none';
            chatInterface.style.display = 'flex';
            inputGroup.style.display = 'flex';
            addSystemMessage('正在连接到聊天服务器...');
            connectWebSocket();
        } else {
            userLoginMessage.textContent = result.message || '用户初始化失败，请刷新页面重试';
        }
    } catch (error) {
        console.error('初始化失败:', error);
        addSystemMessage('初始化失败，请刷新页面重试');
        userLoginMessage.textContent = '初始化失败，请刷新页面重试';
    }
}
        
        // 管理员入口按钮点击事件
        // 在initChatSystem函数中，找到adminEntryButton的点击事件处理函数
// 修改为：

// 管理员入口按钮点击事件
adminEntryButton.addEventListener('click', () => {
    if (isAdminMode) {
        adminLogout();
        isAdminMode = false;
        currentMasterQQ = null;
        adminModeBadge.style.display = 'none';
        addSystemMessage('已退出管理员模式，切换到普通用户模式');
        
        // 重新初始化普通用户会话
        initializeUser();
    } else {
        // 显示管理员登录表单
        showAdminLoginForm();
    }
});

// 显示管理员登录表单函数
function showAdminLoginForm() {
    console.log('显示管理员登录表单');
    
    // 1. 首先清除所有现有的系统消息
    const systemMessages = messageArea.querySelectorAll('.system-message');
    systemMessages.forEach(msg => msg.remove());
    
    // 2. 隐藏其他所有内容
    chatInterface.style.display = 'none';
    userLoginForm.style.display = 'none';
    inputGroup.style.display = 'none';
    
    // 3. 清除消息区域中除了管理员登录表单之外的所有内容
    const messages = messageArea.querySelectorAll('.message-container');
    messages.forEach(msg => msg.remove());
    
    // 4. 将滚动条重置到顶部
    messageArea.scrollTop = 0;
    
    // 5. 显示管理员登录表单，添加特殊类用于样式控制
    adminLoginForm.style.display = 'flex';
    adminLoginForm.classList.add('admin-form-active');
    
    // 6. 清空管理员输入框
    adminAccountInput.value = '';
    adminPasswordInput.value = '';
    adminLoginMessage.textContent = '请输入超管账号和密码以进行管理员登录';
    adminLoginMessage.style.color = '#666';
    
    // 7. 重置管理员登录按钮状态
    adminLoginButton.disabled = false;
    adminLoginButton.textContent = '管理员登录';
    
    // 8. 添加返回链接
    addReturnToUserLink();
}

// 添加返回普通用户界面的链接
function addReturnToUserLink() {
    // 移除已存在的返回链接
    const existingLink = document.querySelector('.switch-to-user-link');
    if (existingLink) {
        existingLink.remove();
    }
    
    const returnLink = document.createElement('div');
    returnLink.className = 'switch-to-user-link';
    returnLink.textContent = '← 返回普通用户界面';
    returnLink.style.cursor = 'pointer';
    returnLink.style.marginTop = '15px';
    returnLink.style.color = '#ef71aa';
    returnLink.style.fontSize = '12px';
    returnLink.style.textDecoration = 'underline';
    
    returnLink.addEventListener('click', () => {
        // 重新初始化普通用户会话
        adminLoginForm.style.display = 'none';
        adminLoginForm.classList.remove('admin-form-active');
        initializeUser();
    });
    
    // 将返回链接添加到管理员登录表单的底部
    const adminLoginMessage = document.querySelector('.admin-login-message');
    if (adminLoginMessage) {
        adminLoginForm.insertBefore(returnLink, adminLoginMessage.nextSibling);
    } else {
        adminLoginForm.appendChild(returnLink);
    }
}

// 管理员登录失败时显示错误弹窗
function showAdminLoginError(message, duration = 5000) {
    // 移除已存在的错误弹窗
    const existingError = document.querySelector('.admin-error-popup');
    if (existingError) {
        existingError.remove();
    }
    
    const errorPopup = document.createElement('div');
    errorPopup.className = 'admin-error';
    errorPopup.textContent = message;
    
    // 样式
    errorPopup.style.position = 'fixed';
    errorPopup.style.top = '20px';
    errorPopup.style.left = '50%';
    errorPopup.style.transform = 'translateX(-50%)';
    errorPopup.style.background = 'linear-gradient(45deg, #ff6b6b, #f44336)';
    errorPopup.style.color = 'white';
    errorPopup.style.padding = '10px 20px';
    errorPopup.style.borderRadius = '20px';
    errorPopup.style.zIndex = '10000';
    errorPopup.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    errorPopup.style.animation = 'fadeIn 0.3s ease-in-out';
    errorPopup.style.fontSize = '14px';
    errorPopup.style.fontWeight = '500';
    
    document.body.appendChild(errorPopup);
    
    // 5秒后自动消失
    setTimeout(() => {
        errorPopup.style.animation = 'fadeOut 0.3s ease-in-out';
        setTimeout(() => {
            if (errorPopup.parentNode) {
                errorPopup.remove();
            }
        }, 300);
    }, duration);
}

// 修改管理员登录按钮点击事件
adminLoginButton.addEventListener('click', async () => {
    const account = adminAccountInput.value.trim();
    const password = adminPasswordInput.value.trim();
    
    if (!account || !password) {
        showAdminLoginError('账号和密码不能为空');
        return;
    }
    
    adminLoginButton.disabled = true;
    adminLoginButton.textContent = '登录中...';
    adminLoginMessage.textContent = '正在验证管理员身份...';
    adminLoginMessage.style.color = '#666';
    
    const result = await adminLogin(account, password);
    
    if (result.success) {
        // 登录成功，隐藏管理员登录表单
        adminLoginForm.style.display = 'none';
        adminLoginForm.classList.remove('admin-form-active');
        
        // 清除返回链接
        const returnLink = document.querySelector('.switch-to-user-link');
        if (returnLink) {
            returnLink.remove();
        }
        
        // 显示聊天界面
        chatInterface.style.display = 'flex';
        isAdminMode = true;
        currentMasterQQ = result.realMasterQQ;
        adminModeBadge.style.display = 'block';
        
        addSystemMessage('管理员登录成功！');
        addSystemMessage(`检测到有效管理员令牌，已进入管理员模式`);
        
        // 显示输入框
        inputGroup.style.display = 'flex';
        
        // 连接WebSocket
        connectWebSocket();
    } else {
        // 登录失败，显示错误弹窗
        showAdminLoginError(result.message || '账号或密码错误');
        adminLoginButton.textContent = '管理员登录';
        adminLoginButton.disabled = false;
    }
});
        
        // 发送按钮点击事件
        sendButton.addEventListener('click', sendMessage);
        
        // 输入框回车事件
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        // 聊天图标点击事件
        chatIcon.addEventListener('click', () => {
            const isVisible = chatWindow.style.display === 'flex';
            chatIcon.style.transform = isVisible ? 'none' : 'rotate(15deg)';
            chatWindow.style.display = isVisible ? 'none' : 'flex';
            
            if (!isVisible) {
                bubbleTip.style.display = 'none';
                bubbleVisible = false;
                
                if (!isInitialized) {
                    isInitialized = true;
                    initializeUser();
                }
            }
        });
        
        // 初始化调整大小功能
        function initResize() {
            let isResizing = false;
            let resizeCorner = null;
            let startX, startY, startWidth, startHeight, startLeft, startTop;
            
            const corners = ['tl', 'tr', 'bl', 'br'];
            corners.forEach(pos => {
                const corner = document.createElement('div');
                corner.className = `resize-corner resize-${pos}`;
                corner.style.position = 'absolute';
                corner.style.width = '20px';
                corner.style.height = '20px';
                corner.style.zIndex = '10000';
                corner.style.background = 'transparent';
                
                switch(pos) {
                    case 'tl': 
                        corner.style.top = '0'; 
                        corner.style.left = '0'; 
                        corner.style.cursor = 'nw-resize'; 
                        break;
                    case 'tr': 
                        corner.style.top = '0'; 
                        corner.style.right = '0'; 
                        corner.style.cursor = 'ne-resize'; 
                        break;
                    case 'bl': 
                        corner.style.bottom = '0'; 
                        corner.style.left = '0'; 
                        corner.style.cursor = 'sw-resize'; 
                        break;
                    case 'br': 
                        corner.style.bottom = '0'; 
                        corner.style.right = '0'; 
                        corner.style.cursor = 'se-resize'; 
                        break;
                }
                
                chatWindow.appendChild(corner);
                
                corner.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    isResizing = true;
                    resizeCorner = pos;
                    
                    startX = e.clientX;
                    startY = e.clientY;
                    startWidth = parseInt(getComputedStyle(chatWindow).width, 10);
                    startHeight = parseInt(getComputedStyle(chatWindow).height, 10);
                    startLeft = parseInt(getComputedStyle(chatWindow).left, 10) || 0;
                    startTop = parseInt(getComputedStyle(chatWindow).top, 10) || 0;
                    
                    function handleMouseMove(e) {
                        if (!isResizing) return;
                        
                        const deltaX = e.clientX - startX;
                        const deltaY = e.clientY - startY;
                        
                        switch(resizeCorner) {
                            case 'tl':
                                chatWindow.style.width = Math.max(300, startWidth - deltaX) + 'px';
                                chatWindow.style.height = Math.max(300, startHeight - deltaY) + 'px';
                                chatWindow.style.left = (startLeft + deltaX) + 'px';
                                chatWindow.style.top = (startTop + deltaY) + 'px';
                                break;
                            case 'tr':
                                chatWindow.style.width = Math.max(300, startWidth + deltaX) + 'px';
                                chatWindow.style.height = Math.max(300, startHeight - deltaY) + 'px';
                                chatWindow.style.top = (startTop + deltaY) + 'px';
                                break;
                            case 'bl':
                                chatWindow.style.width = Math.max(300, startWidth - deltaX) + 'px';
                                chatWindow.style.height = Math.max(300, startHeight + deltaY) + 'px';
                                chatWindow.style.left = (startLeft + deltaX) + 'px';
                                break;
                            case 'br':
                                chatWindow.style.width = Math.max(300, startWidth + deltaX) + 'px';
                                chatWindow.style.height = Math.max(300, startHeight + deltaY) + 'px';
                                break;
                        }
                    }
                    
                    function stopResize() {
                        isResizing = false;
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', stopResize);
                    }
                    
                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', stopResize);
                });
            });
            
            // 拖动窗口
            const header = chatWindow.querySelector('.chat-header');
            let isDragging = false;
            let dragStartX, dragStartY, dragStartLeft, dragStartTop;
            
            header.addEventListener('mousedown', (e) => {
                if (e.target.closest('.admin-entry-button') || e.target.closest('#statusIndicator')) {
                    return;
                }
                
                isDragging = true;
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                dragStartLeft = parseInt(getComputedStyle(chatWindow).left, 10) || 0;
                dragStartTop = parseInt(getComputedStyle(chatWindow).top, 10) || 0;
                
                function handleDragMove(e) {
                    if (!isDragging) return;
                    
                    const deltaX = e.clientX - dragStartX;
                    const deltaY = e.clientY - dragStartY;
                    
                    chatWindow.style.left = (dragStartLeft + deltaX) + 'px';
                    chatWindow.style.top = (dragStartTop + deltaY) + 'px';
                }
                
                function stopDragging() {
                    isDragging = false;
                    document.removeEventListener('mousemove', handleDragMove);
                    document.removeEventListener('mouseup', stopDragging);
                }
                
                document.addEventListener('mousemove', handleDragMove);
                document.addEventListener('mouseup', stopDragging);
            });
        }
        
        // 初始化调整大小功能
        initResize();
        
        // 初始化聊天系统
        initializeUser();
    }
    
    // 初始化聊天系统
    initChatSystem();
});
