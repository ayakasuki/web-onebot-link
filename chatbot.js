document.addEventListener('DOMContentLoaded', () => {
    // 获取当前执行的script标签
    const currentScript = document.currentScript || 
      document.querySelector('script[src*="chatbot.js"]');
    
    // 从data属性读取安全参数
    const config = {
      BOT_QQ: currentScript.dataset.botQq,
      BOT_NAME: currentScript.dataset.botName,
      WS_URL: currentScript.dataset.wsUrl,
      MASTER_QQ: currentScript.dataset.masterQq,
      MASTER_PASSWORD: currentScript.dataset.masterPassword
    };
  
    // 验证必要参数
    if (!config.BOT_QQ || !config.WS_URL || !config.BOT_NAME ) {
      console.error('缺失机器人必要配置参数');
      return;
    }

    // 使用配置参数
    const CHAT_ICON_SVG = '/diy/static/chatbot/message.svg';

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
    // 检查聊天窗口是否关闭
    const isChatClosed = chatWindow.style.display !== 'flex';
    
    if (!bubbleVisible && isChatClosed) {
        bubbleTip.style.display = 'block';
        bubbleVisible = true;
        
        // 10秒后自动隐藏
        setTimeout(() => {
            if (bubbleVisible) {
                bubbleTip.style.display = 'none';
                bubbleVisible = false;
            }
        }, 10000);
    }
}
    // 点击气泡任意地方立即隐藏
    bubbleTip.addEventListener('click', () => {
        bubbleTip.style.display = 'none';
        bubbleVisible = false;
        
        // 重新开始两分钟计时
        clearInterval(bubbleTimer);
        bubbleTimer = setInterval(showBubble, 120000);
    });
    
    // 初始启动定时器
    bubbleTimer = setInterval(showBubble, 120000);
    
    const chatWindow = document.createElement('div');
    chatWindow.id = 'chatWindow';
    document.body.appendChild(chatWindow);
    
    function initChatSystem() {
        const { BOT_QQ, BOT_NAME, WS_URL, MASTER_QQ, MASTER_PASSWORD } = config;
        // 添加窗口大小调整手柄
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        chatWindow.appendChild(resizeHandle);
        
        // 头部区域
        const header = document.createElement('div');
        header.className = 'chat-header';
        header.innerHTML = `<h3>这是你的${BOT_NAME}呀~</h3>`;
        
        const statusIndicator = document.createElement('div');
        statusIndicator.id = 'statusIndicator';
        statusIndicator.textContent = '● 离线';
        header.appendChild(statusIndicator);
        
        // 消息区域
        const messageArea = document.createElement('div');
        messageArea.id = 'messageArea';
        
        // 登录表单
        const loginForm = document.createElement('div');
        loginForm.className = 'login-form';
        
        const userQQInput = document.createElement('input');
        userQQInput.className = 'user-input';
        userQQInput.placeholder = '请输入你的QQ号';
        userQQInput.id = 'userQQInput';
        userQQInput.name = 'qq';
        
        const loginButton = document.createElement('button');
        loginButton.className = 'login-button';
        loginButton.textContent = '登录';
        
        loginForm.appendChild(userQQInput);
        loginForm.appendChild(loginButton);

        // 在loginForm中添加机器人头像
        const botAvatarContainer = document.createElement('div');
        botAvatarContainer.className = 'bot-avatar-container';

        const botAvatar = document.createElement('img');
        botAvatar.className = 'bot-avatar';
        botAvatar.src = `https://q.qlogo.cn/g?b=qq&s=0&nk=${BOT_QQ}`;
        botAvatar.alt = `${BOT_NAME}头像`;

        botAvatarContainer.appendChild(botAvatar);
        loginForm.insertBefore(botAvatarContainer, userQQInput);
        
        // 输入区域
        const inputGroup = document.createElement('div');
        inputGroup.className = 'input-group';
        inputGroup.style.display = 'none'; // 默认隐藏
        
        const messageInput = document.createElement('input');
        messageInput.className = 'message-input';
        messageInput.placeholder = '发送消息给机器人...';
        messageInput.id = 'chatMessageInput';
        messageInput.name = 'message';
        messageInput.autocomplete = 'off';
        
        const sendButton = document.createElement('button');
        sendButton.className = 'send-button';
        sendButton.textContent = '发送';
        
        inputGroup.appendChild(messageInput);
        inputGroup.appendChild(sendButton);
        
        chatWindow.appendChild(header);
        chatWindow.appendChild(messageArea);
        messageArea.appendChild(loginForm);
        chatWindow.appendChild(inputGroup);
        
        let socket = null;
        let userQQ = null;
        let heartbeatTimer = null;
        let heartbeatCheckTimer = null;
        let lastPongTime = null;
        let reconnectAttempts = 0;
        const MAX_RECONNECT_ATTEMPTS = 5;
        let messageCounter = 100000;
        let isResizing = false;
        let startX, startY, startWidth, startHeight;
        let connectionState = 'disconnected';
        
        // 动态添加密码框（管理员专属）
        userQQInput.addEventListener('input', function() {
            const passwordInput = document.getElementById('masterPasswordInput');
            if (this.value.trim() === MASTER_QQ && !passwordInput) {
                const passwordField = document.createElement('input');
                passwordField.type = 'password';
                passwordField.placeholder = '管理员密码';
                passwordField.id = 'masterPasswordInput';
                passwordField.className = 'user-input password-input';
                loginForm.insertBefore(passwordField, loginButton);
            } else if (passwordInput && this.value.trim() !== MASTER_QQ) {
                passwordInput.remove();
            }
        });
        
        // 模拟的bot信息
        const simulatedBotInfo = {
            model: 'Web-Onebot-link',
            info: {
                user_id: BOT_QQ,
                nickname: BOT_NAME
            },
            guild_info: {},
            clients: [],
            version: {
                app_name: 'Web-Onebot-link',
                app_version: '1.0.0',
                protocol_version: 'v11',
                version: 'Web-Onebot-link v1.0.0'
            }
        };
        
        function updateStatus(text, color) {
            statusIndicator.innerHTML = `● ${text}`;
            statusIndicator.style.color = color;
            connectionState = text.toLowerCase();
            console.log(`[STATUS] 连接状态更新: ${text}`);
        }

        function addMessage(content, sender, type = 'text') {
            const container = document.createElement('div');
            container.className = `message-container ${sender}`;
            
            const avatarContainer = document.createElement('div');
            avatarContainer.className = 'avatar-container';
            
            const avatar = document.createElement('img');
            avatar.className = 'avatar-img';
            avatar.src = sender === 'user' 
                ? `https://q.qlogo.cn/g?b=qq&s=0&nk=${userQQ}`
                : `https://q.qlogo.cn/g?b=qq&s=0&nk=${BOT_QQ}`;
            
            avatarContainer.appendChild(avatar);
            container.appendChild(avatarContainer);
            
            const contentContainer = document.createElement('div');
            contentContainer.className = 'content-container';

            if (userQQ === MASTER_QQ && sender === 'user') {
                const badge = document.createElement('span');
                badge.className = 'admin-badge';
                badge.textContent = '管理员';
                avatarContainer.appendChild(badge);
            }
            
            if (type === 'text') {
                const bubble = document.createElement('div');
                bubble.className = 'message-bubble';
                
                // 关键改进1：处理换行符
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
                
                // 关键改进2：识别多种图片格式
                if (content.startsWith('http://') || content.startsWith('https://') || 
                    content.startsWith('/') || content.startsWith('./') || content.startsWith('../')) {
                    img.src = content; // 直接使用URL
                } else if (content.startsWith('base64://')) {
                    const base64Data = content.replace('base64://', '');
                    img.src = `data:image/png;base64,${base64Data}`;
                } else {
                    console.warn('无法识别的图片格式:', content);
                    img.src = ''; // 安全回退
                }
                
                contentContainer.appendChild(img);
            }
            setTimeout(() => {
                const robotImages = document.querySelectorAll('.message-container.robot .fancybox');
                robotImages.forEach(img => {
                  img.addEventListener('dblclick', () => {
                    // 调用主题的 Fancybox 插件
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
        
                // 在全局变量区域添加
        let typingIndicators = {}; // 存储所有正在显示的指示器 {messageId: indicatorId}
        let typingTimeouts = {};   // 存储指示器的超时定时器
        
        // 在addMessage函数后添加新函数 - 创建打字指示器
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
            
            // 创建三个动画圆点
            for (let i = 0; i < 3; i++) {
                const dot = document.createElement('span');
                dot.className = 'typing-dot';
                bubble.appendChild(dot);
            }
            
            contentContainer.appendChild(bubble);
            container.appendChild(contentContainer);
            messageArea.appendChild(container);
            messageArea.scrollTop = messageArea.scrollHeight;
            
            // 设置2分钟超时
            typingTimeouts[messageId] = setTimeout(() => {
                removeTypingIndicator(messageId);
                addSystemMessage('服务可能繁忙，可能会更长时间才能得到回复。请稍等，也可重复发送信息~');
            }, 120000); // 2分钟
            
            return container.id;
        }
        
        // 添加移除指示器的函数
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
        
        function addSystemMessage(text) {
            const sysMsg = document.createElement('div');
            sysMsg.className = 'system-message';
            sysMsg.textContent = text;
            messageArea.appendChild(sysMsg);
            messageArea.scrollTop = messageArea.scrollHeight;
            console.log(`[SYSTEM] ${text}`);
        }
        
        function stopHeartbeat() {
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }
        }
        
        // 关键修复：完整的心跳包格式（包含status字段）
        function sendHeartbeat() {
            if (!socket || socket.readyState !== WebSocket.OPEN) return;
            
            try {
                const heartbeatPayload = {
                    "post_type": "meta_event",
                    "meta_event_type": "heartbeat",
                    "self_id": BOT_QQ,
                    "time": Math.floor(Date.now() / 1000),
                    "interval": 15000,
                    "status": {  // 必需字段
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
                    
                    // 发送认证信息（符合OneBotv11协议）
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
                    
                    // 启动心跳机制
                    startHeartbeat();
                };
                
                // 处理API请求（关键新增）
                 // 核心修复：API请求处理器
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
                    // 模拟好友列表，包含用户输入的QQ号
                    response.data = [
                        {
                            user_id: userQQ,
                            nickname: "用户",
                            remark: ""
                        }
                    ];
                    break;
                    
                case "get_group_list":
                    console.log("[API] 响应get_group_list");
                    response.data = [
                        {
                            group_id: 000,
                            group_name: "群组",
                            group_memo: "",
                            group_create_time: 0,
                            group_level: 0,
                            member_count: 0,
                            max_member_count: 0
                        }
                    ]; // 模拟没有群组
                    break;
                    
                case "_set_model_show":
                    console.log("[API] 响应_set_model_show");
                    response.data = { result: true };
                    break;
                    
                }
                        
                        // 发送API响应
                try {
                    socket.send(JSON.stringify(response));
                    console.log('[SEND] API响应:', response);
                } catch (e) {
                    console.error('[ERROR] API响应发送失败:', e);
                }
            }
                
                function parseMessageSegment(segment) {
                    if (segment.type === 'text') {
                      return segment.data.text;
                    } else if (segment.type === 'image') {
                      const base64Data = segment.data.file.replace('base64://', '');
                      return `data:image/${segment.data.type || 'png'};base64,${base64Data}`;
                    } else if (segment.type === 'node') { // 关键修复：处理嵌套消息
                      const nodeContent = segment.data.content.map(parseMessageSegment).join('');
                      return `[转发消息] ${segment.data.name}: ${nodeContent}`;
                    }
                    return `[暂不支持的消息类型: ${segment.type}]`;
                  }
                  
                  socket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        console.log('[RECV] 收到消息', data);
                        
                        // 检查是否有待处理的指示器
                        const messageIds = Object.keys(typingIndicators);
                        if (messageIds.length > 0) {
                            // 移除最早的消息指示器
                            const oldestMessageId = messageIds[0];
                            removeTypingIndicator(oldestMessageId);
                        }
                        
                        if (data.echo) {
                            handleApiRequest(data);
                        }
                        
                        if (data.meta_event_type === 'heartbeat') {
                            lastPongTime = Date.now();
                            console.log('[HEARTBEAT] 收到心跳响应');
                            return;
                        }
                        // 处理转发信息
                        if (data.action === 'send_private_forward_msg' && data.params) {
                            addForwardMessage(data.params.messages);
                        }
                        // 处理普通消息
                        if (data.action === 'send_msg' && data.params) {
                            const messageArray = data.params.message;
                            if (Array.isArray(messageArray)) {
                                messageArray.forEach(segment => {
                                    if (segment.type === 'text') {
                                        // 关键改进：保留换行符
                                        addMessage(segment.data.text, 'robot');
                                    } else if (segment.type === 'image') {
                                        // 关键改进：支持多种图片格式
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
                    // 清除所有打字指示器
                    Object.keys(typingIndicators).forEach(removeTypingIndicator);
                    typingIndicators = {};
                    typingTimeouts = {};
                    
                    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts));
                        reconnectAttempts++;
                        addSystemMessage(`将在 ${delay/1000} 秒后尝试重新连接...`);
                        
                        // 智能重连策略
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
        
        // 新增：创建转发消息预览
            function addForwardMessage(messages) {
                // 创建机器人消息容器
                const messageContainer = document.createElement('div');
                messageContainer.className = 'message-container robot';
                
                // 创建机器人头像
                const avatarContainer = document.createElement('div');
                avatarContainer.className = 'avatar-container';
                
                const avatar = document.createElement('img');
                avatar.className = 'avatar-img';
                avatar.src = `https://q.qlogo.cn/g?b=qq&s=0&nk=${config.BOT_QQ}`;
                avatarContainer.appendChild(avatar);
                messageContainer.appendChild(avatarContainer);
                
                // 创建内容容器
                const contentContainer = document.createElement('div');
                contentContainer.className = 'content-container';
                
                // 创建转发预览框
                const previewContainer = document.createElement('div');
                previewContainer.className = 'forward-preview-container';
                
                // 创建预览标题
                const previewTitle = document.createElement('div');
                previewTitle.className = 'forward-preview-title';
                previewTitle.textContent = '转发的聊天记录';
                previewContainer.appendChild(previewTitle);
                
                // 创建消息节点容器
                const nodesContainer = document.createElement('div');
                nodesContainer.className = 'forward-nodes-container';
                
                // 处理每个消息节点
                messages.forEach((node, index) => {
                    if (node.data.content.length > 0) {
                        const firstContent = node.data.content[0];
                        const nodeElement = document.createElement('div');
                        nodeElement.className = 'forward-preview-node';
                        
                        // 创建头像
                        const avatar = document.createElement('img');
                        avatar.className = 'forward-preview-avatar';
                        avatar.src = `https://q.qlogo.cn/g?b=qq&s=0&nk=${node.data.uin}`;
                        
                        // 创建文本预览
                        const textPreview = document.createElement('div');
                        textPreview.className = 'forward-preview-text';
                        if (firstContent.type === 'text') {
                            const text = firstContent.data.text;
                            const firstLine = text.split('\n')[0];
                            textPreview.textContent = firstLine;
                        } else if (firstContent.type === 'image') {
                            textPreview.textContent = '[图片]';
                        } else {
                            textPreview.textContent = `[${firstContent.type}]`;
                        }
                        
                        nodeElement.appendChild(avatar);
                        nodeElement.appendChild(textPreview);
                        nodesContainer.appendChild(nodeElement);
                    }
                });
                
                previewContainer.appendChild(nodesContainer);
                contentContainer.appendChild(previewContainer);
                messageContainer.appendChild(contentContainer);
                messageArea.appendChild(messageContainer);
                messageArea.scrollTop = messageArea.scrollHeight;
                
                // 点击预览展开详细消息
                previewContainer.addEventListener('click', () => {
                    showForwardDetail(messages);
                });
            }

            // 新增：显示转发详情弹窗
            function showForwardDetail(messages) {
                // 创建弹窗容器
                const detailModal = document.createElement('div');
                detailModal.className = 'forward-detail-modal';
                
                // 创建弹窗内容容器
                const detailContent = document.createElement('div');
                detailContent.className = 'forward-detail-content';
                
                // 创建关闭按钮
                const closeBtn = document.createElement('div');
                closeBtn.className = 'forward-detail-close';
                closeBtn.textContent = '×';
                closeBtn.addEventListener('click', () => {
                    document.body.removeChild(detailModal);
                });
                detailContent.appendChild(closeBtn);
                
                // 处理每个消息节点
                messages.forEach(node => {
                    // 创建节点容器
                    const nodeContainer = document.createElement('div');
                    nodeContainer.className = 'forward-detail-node';
                    
                    // 创建节点头部（头像和名字）
                    const nodeHeader = document.createElement('div');
                    nodeHeader.className = 'forward-detail-header';
                    
                    const avatar = document.createElement('img');
                    avatar.className = 'forward-detail-avatar';
                    avatar.src = `https://q.qlogo.cn/g?b=qq&s=0&nk=${node.data.uin}`;
                    
                    const name = document.createElement('span');
                    name.className = 'forward-detail-name';
                    name.textContent = node.data.name;
                    
                    nodeHeader.appendChild(avatar);
                    nodeHeader.appendChild(name);
                    nodeContainer.appendChild(nodeHeader);
                    
                    // 创建节点消息内容
                    const nodeMessages = document.createElement('div');
                    nodeMessages.className = 'forward-detail-messages';
                    
                    // 处理节点内的每条消息
                    node.data.content.forEach(contentItem => {
                        if (contentItem.type === 'text') {
                            const textBubble = document.createElement('div');
                            textBubble.className = 'message-bubble';
                            
                            // 处理换行
                            const lines = contentItem.data.text.split('\n');
                            lines.forEach((line, index) => {
                                textBubble.appendChild(document.createTextNode(line));
                                if (index < lines.length - 1) {
                                    textBubble.appendChild(document.createElement('br'));
                                }
                            });
                            
                            nodeMessages.appendChild(textBubble);
                        } else if (contentItem.type === 'image') {
                            const img = document.createElement('img');
                            img.className = 'message-image fancybox';
                            img.dataset.fancybox = "gallery";
                            
                            // 处理图片URL
                            if (contentItem.data.file.startsWith('http') || 
                                contentItem.data.file.startsWith('/') || 
                                contentItem.data.file.startsWith('./')) {
                                img.src = contentItem.data.file;
                            } else if (contentItem.data.file.startsWith('base64://')) {
                                const base64Data = contentItem.data.file.replace('base64://', '');
                                img.src = `data:image/png;base64,${base64Data}`;
                            } else {
                                console.warn('无法识别的图片格式:', contentItem.data.file);
                                img.src = '';
                            }
                            
                            nodeMessages.appendChild(img);
                        }
                    });
                    
                    nodeContainer.appendChild(nodeMessages);
                    detailContent.appendChild(nodeContainer);
                });
                
                detailModal.appendChild(detailContent);
                document.body.appendChild(detailModal);
                
                // 点击弹窗外部关闭弹窗
                detailModal.addEventListener('click', (e) => {
                    if (e.target === detailModal) {
                        document.body.removeChild(detailModal);
                    }
                });
            }

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
        
        function startHeartbeat() {
            stopHeartbeat();
            sendHeartbeat();
            heartbeatTimer = setInterval(sendHeartbeat, 15000);
        }
        
        function sendMessage() {
            const message = messageInput.value.trim();
            if (!message || !socket) return;
            // 生成唯一消息ID
            const messageId = messageCounter++;
            // 添加用户消息
            addMessage(message, 'user');
            
            // 添加机器人打字指示器
            const indicatorId = addTypingIndicator(messageId);
            typingIndicators[messageId] = indicatorId;
            
            if (socket.readyState === WebSocket.OPEN) {
                
                try {
                    const messageId = messageCounter++;
                    const eventPayload = {
                        "post_type": "message",
                        "message_type": "private",
                        "sub_type": "friend",
                        "message_id": messageId,
                        "user_id": userQQ,
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
                            "user_id": userQQ,
                            "nickname": "用户",
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
        
        function initResize() {
            // 创建四角拉伸区域
            const corners = ['tl', 'tr', 'bl', 'br'];
            corners.forEach(pos => {
                const corner = document.createElement('div');
                corner.className = `resize-corner resize-${pos}`;
                chatWindow.appendChild(corner);
                
                corner.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    isResizing = true;
                    resizeCorner = pos; // 记录当前拉伸的角落
                    
                    startX = e.clientX;
                    startY = e.clientY;
                    startWidth = parseInt(document.defaultView.getComputedStyle(chatWindow).width, 10);
                    startHeight = parseInt(document.defaultView.getComputedStyle(chatWindow).height, 10);
                    startLeft = parseInt(document.defaultView.getComputedStyle(chatWindow).left, 10) || 0;
                    startTop = parseInt(document.defaultView.getComputedStyle(chatWindow).top, 10) || 0;
                    
                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', stopResize);
                });
            });
        
            function handleMouseMove(e) {
                if (!isResizing) return;
                
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                switch(resizeCorner) {
                    case 'tl': // 左上角
                        chatWindow.style.width = (startWidth - deltaX) + 'px';
                        chatWindow.style.height = (startHeight - deltaY) + 'px';
                        chatWindow.style.left = (startLeft + deltaX) + 'px';
                        chatWindow.style.top = (startTop + deltaY) + 'px';
                        break;
                    case 'tr': // 右上角
                        chatWindow.style.width = (startWidth + deltaX) + 'px';
                        chatWindow.style.height = (startHeight - deltaY) + 'px';
                        chatWindow.style.top = (startTop + deltaY) + 'px';
                        break;
                    case 'bl': // 左下角
                        chatWindow.style.width = (startWidth - deltaX) + 'px';
                        chatWindow.style.height = (startHeight + deltaY) + 'px';
                        chatWindow.style.left = (startLeft + deltaX) + 'px';
                        break;
                    case 'br': // 右下角
                        chatWindow.style.width = (startWidth + deltaX) + 'px';
                        chatWindow.style.height = (startHeight + deltaY) + 'px';
                        break;
                }
                
                // 确保最小尺寸
                const width = parseInt(chatWindow.style.width);
                const height = parseInt(chatWindow.style.height);
                chatWindow.style.width = Math.max(300, width) + 'px';
                chatWindow.style.height = Math.max(300, height) + 'px';
            }
            
            function stopResize() {
                isResizing = false;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', stopResize);
            }
        }
        
        chatIcon.addEventListener('click', () => {
            const isVisible = chatWindow.style.display === 'flex';
            chatIcon.style.transform = isVisible ? 'none' : 'rotate(15deg)';
            chatWindow.style.display = isVisible ? 'none' : 'flex';
            
            // 打开窗口时立即隐藏气泡
            if (!isVisible) {
                bubbleTip.style.display = 'none';
                bubbleVisible = false;
            }
        });
        
        // 登录按钮事件 (整合管理员验证)
        loginButton.addEventListener('click', () => {
            const qq = userQQInput.value.trim();
            
            // 空值检查
            if (!qq) {
                addSystemMessage('请输入你的QQ号');
                return;
            }
            
            // 管理员验证
            let isAdmin = false;
            if (qq === MASTER_QQ) {
                const passwordInput = document.getElementById('masterPasswordInput');
                if (!passwordInput || !passwordInput.value) {
                    addSystemMessage('管理员需要输入密码');
                    return;
                }
                if (passwordInput.value !== MASTER_PASSWORD) {
                    addSystemMessage('管理员密码错误');
                    return;
                }
                isAdmin = true;
            }
            
            // 登录成功处理
            userQQ = qq;
            loginForm.style.display = 'none';
            inputGroup.style.display = 'flex';
            addSystemMessage(isAdmin ? '管理员登录成功' : `你的QQ号: ${userQQ}`);
            
            // 添加欢迎消息
            const welcomeMsg = document.createElement('div');
            welcomeMsg.className = 'welcome-message';
            welcomeMsg.textContent = '欢迎使用小桃妹~桃妹的原型是胡桃，直接与我对话是用大模型对话哦，可能会慢一点，请稍等就好，更多机器人功能请输入#帮助';
            messageArea.appendChild(welcomeMsg);
            
            // 连接WebSocket
            connectWebSocket();
        });
        
        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
        
        addSystemMessage('请设置你的QQ号以开始聊天');
        initResize();
    }
    
    initChatSystem(config);
});