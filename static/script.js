let currentConversationId = null;
let currentSystemPromptId = null;
let currentSystemPrompt = ""; // 默认系统提示词
let apiKey = localStorage.getItem('gemini_api_key');

let isSelectMode = {
    conversations: false,
    'system-prompts': false,
    prompts: false
};

async function sendMessage() {
    if (!apiKey) {
        alert('请先设置 API Key');
        return;
    }
    
    const input = document.getElementById('userInput');
    const message = input.value.trim();
    if (!message) return;
    
    if (!currentConversationId) {
        await createNewConversation();
    }
    
    // 显示用户消息
    appendMessage(message, 'user');
    input.value = '';
    input.style.height = 'auto';  // 重置输入框高度

    try {
        // 保存到本地
        await localDB.saveMessage({
            conversation_id: currentConversationId,
            role: 'user',
            content: message
        });
        
        const headers = {
            'Content-Type': 'application/json',
            'X-API-Key': localStorage.getItem('gemini_api_key'),
            'X-Model-Name': localStorage.getItem('gemini_model') || 'gemini-2.0-pro-exp-02-05'
        };
        
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                message: message,
                conversation_id: currentConversationId,
                system_prompt: document.getElementById('systemPromptInput').value
            })
        });

        const data = await response.json();
        
        // 保存响应到本地
        await localDB.saveMessage({
            conversation_id: currentConversationId,
            role: 'assistant',
            content: data.response
        });
        
        appendMessage(data.response, 'bot');
        
        // 如果是第一条消息，重新加载对话列表以显示新标题
        if (data.is_first_message) {
            loadConversations();
        }
    } catch (error) {
        console.error('Error:', error);
        appendMessage('发生错误，请稍后重试', 'bot');
    }
}

function appendMessage(message, sender, messageId = null) {
    const chatContainer = document.getElementById('chat-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    if (messageId) {
        messageDiv.setAttribute('data-message-id', messageId);
    }
    
    // 消息内容
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // 使用marked渲染Markdown（仅对bot消息）
    if (sender === 'bot') {
        contentDiv.innerHTML = marked.parse(message);
    } else {
        contentDiv.textContent = message;
    }
    
    messageDiv.appendChild(contentDiv);
    
    // 操作按钮
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    
    const editBtn = document.createElement('button');
    editBtn.textContent = '编辑';
    editBtn.onclick = () => editMessage(messageDiv, message);
    
    const translateBtn = document.createElement('button');
    translateBtn.className = 'translate-btn';
    translateBtn.innerHTML = '翻译';
    translateBtn.onclick = (e) => showTranslateOptions(messageDiv, message, e);
    
    const resendBtn = document.createElement('button');
    resendBtn.className = 'resend-btn';
    resendBtn.innerHTML = '重发';
    resendBtn.onclick = () => {
        if (!localStorage.getItem('gemini_api_key')) {
            alert('请先设置 API Key');
            return;
        }
        resendMessage(messageDiv, message);
    };
    
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(translateBtn);
    actionsDiv.appendChild(resendBtn);
    messageDiv.appendChild(actionsDiv);
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function editMessage(messageDiv, originalContent) {
    messageDiv.className += ' editing';
    const contentDiv = messageDiv.querySelector('.message-content');
    const actionsDiv = messageDiv.querySelector('.message-actions');
    
    // 创建编辑区域
    const textarea = document.createElement('textarea');
    textarea.value = originalContent;
    contentDiv.textContent = '';
    contentDiv.appendChild(textarea);
    
    // 创建编辑操作按钮
    const editActionsDiv = document.createElement('div');
    editActionsDiv.className = 'edit-actions';
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'save';
    saveBtn.textContent = '保存';
    saveBtn.onclick = () => saveEdit(messageDiv, textarea.value);
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.onclick = () => cancelEdit(messageDiv, originalContent);
    
    editActionsDiv.appendChild(saveBtn);
    editActionsDiv.appendChild(cancelBtn);
    
    actionsDiv.style.display = 'none';
    messageDiv.appendChild(editActionsDiv);
}

async function saveEdit(messageDiv, newContent) {
    const messageId = messageDiv.getAttribute('data-message-id');
    const isUserMessage = messageDiv.classList.contains('user-message');
    
    try {
        // 如果是用户消息，重新发送获取新的回复
        if (isUserMessage) {
            await resendMessage(messageDiv, newContent);
        }
        
        // 更新消息显示
        const contentDiv = messageDiv.querySelector('.message-content');
        contentDiv.textContent = newContent;
        
        // 恢复正常显示状态
        messageDiv.classList.remove('editing');
        messageDiv.querySelector('.message-actions').style.display = '';
        messageDiv.querySelector('.edit-actions').remove();
    } catch (error) {
        console.error('Error saving edit:', error);
        alert('保存编辑失败');
    }
}

function cancelEdit(messageDiv, originalContent) {
    const contentDiv = messageDiv.querySelector('.message-content');
    contentDiv.textContent = originalContent;
    
    messageDiv.classList.remove('editing');
    messageDiv.querySelector('.message-actions').style.display = '';
    messageDiv.querySelector('.edit-actions').remove();
}

async function resendMessage(messageDiv, message) {
    try {
        // 获取当前对话的系统提示词
        const systemPrompt = document.getElementById('systemPromptInput').value;
        
        const headers = {
            'Content-Type': 'application/json',
            'X-API-Key': localStorage.getItem('gemini_api_key'),
            'X-Model-Name': localStorage.getItem('gemini_model') || 'gemini-2.0-pro-exp-02-05'
        };
        
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                message: message,
                conversation_id: currentConversationId,
                system_prompt: systemPrompt
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // 更新消息内容
        const contentDiv = messageDiv.querySelector('.message-content');
        if (contentDiv) {
            contentDiv.innerHTML = marked.parse(data.response);
        }
        
        // 保存到本地数据库
        await localDB.saveMessage({
            conversation_id: currentConversationId,
            role: 'assistant',
            content: data.response
        });

    } catch (error) {
        console.error('重发消息失败:', error);
        alert(`重发消息失败: ${error.message}`);
        
        // 显示错误信息在消息区域
        const contentDiv = messageDiv.querySelector('.message-content');
        if (contentDiv) {
            contentDiv.innerHTML = `<div class="error-message">消息发送失败: ${error.message}</div>`;
        }
    }
}

async function loadConversations() {
    try {
        // 优先从本地加载
        const conversations = await localDB.getConversations();
        updateConversationList(conversations);
        
        // 后台同步服务器数据
        localDB.syncData();
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

async function loadPrompts() {
    try {
        const response = await fetch('/api/prompts');
        const prompts = await response.json();
        const promptList = document.getElementById('promptList');
        promptList.innerHTML = '';
        
        prompts.forEach(prompt => {
            const div = document.createElement('div');
            div.className = 'prompt-item';
            
            // 添加复选框
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'item-checkbox';
            checkbox.value = prompt.id;
            div.appendChild(checkbox);
            
            const span = document.createElement('span');
            span.textContent = prompt.title;
            span.onclick = () => usePrompt(prompt.content);
            
            // 添加删除按钮
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            deleteButton.innerHTML = '🗑️';
            deleteButton.title = '删除提示词';
            deleteButton.onclick = (e) => {
                e.stopPropagation();
                deleteItem('prompts', prompt.id);
            };
            
            div.appendChild(span);
            div.appendChild(deleteButton);
            promptList.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading prompts:', error);
    }
}

function usePrompt(content) {
    document.getElementById('userInput').value = content;
}

function showAddPromptDialog() {
    const title = prompt('输入提示词标题:');
    const content = prompt('输入提示词内容:');
    
    if (title && content) {
        addPrompt(title, content);
    }
}

async function addPrompt(title, content) {
    try {
        await fetch('/api/prompts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, content })
        });
        loadPrompts();
    } catch (error) {
        console.error('Error adding prompt:', error);
    }
}

async function loadSystemPrompts() {
    try {
        const response = await fetch('/api/system_prompts');
        const prompts = await response.json();
        const promptList = document.getElementById('systemPromptList');
        promptList.innerHTML = '';
        
        prompts.forEach(prompt => {
            const div = document.createElement('div');
            div.className = 'system-prompt-item';
            
            // 添加复选框
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'item-checkbox';
            checkbox.value = prompt.id;
            div.appendChild(checkbox);
            
            const span = document.createElement('span');
            span.textContent = prompt.title;
            span.onclick = () => selectSystemPrompt(prompt.id, prompt.title, prompt.content);
            
            const editButton = document.createElement('button');
            editButton.className = 'edit-button';
            editButton.innerHTML = '✎';
            editButton.title = '编辑系统提示词';
            editButton.onclick = (e) => {
                e.stopPropagation();
                editSystemPrompt(prompt.id, prompt.title, prompt.content);
            };
            
            // 添加删除按钮
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            deleteButton.innerHTML = '🗑️';
            deleteButton.title = '删除系统提示词';
            deleteButton.onclick = (e) => {
                e.stopPropagation();
                deleteItem('system-prompts', prompt.id);
            };
            
            div.appendChild(span);
            div.appendChild(editButton);
            div.appendChild(deleteButton);
            promptList.appendChild(div);
        });
        
        // 初始化系统提示词编辑框
        const systemPromptInput = document.getElementById('systemPromptInput');
        systemPromptInput.value = currentSystemPrompt;
    } catch (error) {
        console.error('Error loading system prompts:', error);
    }
}

function selectSystemPrompt(id, title, content) {
    currentSystemPromptId = id;
    document.querySelectorAll('.system-prompt-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // 更新系统提示词编辑框
    const systemPromptInput = document.getElementById('systemPromptInput');
    systemPromptInput.value = content;
    currentSystemPrompt = content;
}

function editSystemPrompt(id, title, content) {
    const newTitle = prompt('输入系统角色名称:', title);
    if (!newTitle) return;
    
    const newContent = document.getElementById('systemPromptInput').value;
    updateSystemPromptInDB(id, newTitle, newContent);
}

async function updateSystemPromptInDB(id, title, content) {
    try {
        const response = await fetch(`/api/system_prompts/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, content })
        });
        
        if (response.ok) {
            loadSystemPrompts();
        } else {
            alert('更新系统提示词失败');
        }
    } catch (error) {
        console.error('Error updating system prompt:', error);
        alert('更新系统提示词失败');
    }
}

function updateSystemPrompt() {
    const content = document.getElementById('systemPromptInput').value;
    currentSystemPrompt = content;
    
    if (currentSystemPromptId) {
        // 如果当前选中了系统提示词，则更新数据库
        const promptItem = document.querySelector('.system-prompt-item.active span');
        if (promptItem) {
            updateSystemPromptInDB(currentSystemPromptId, promptItem.textContent, content);
        }
    }
}

function showNewConversationDialog() {
    if (!currentSystemPromptId) {
        createNewConversation();
    } else {
        createNewConversation(null, currentSystemPromptId);
    }
}

async function createNewConversation(firstMessage = '', systemPromptId = null) {
    try {
        const response = await fetch('/api/conversations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                first_message: firstMessage,
                system_prompt_id: systemPromptId
            })
        });
        const data = await response.json();
        currentConversationId = data.id;
        loadConversations();
        clearChat();
    } catch (error) {
        console.error('Error creating conversation:', error);
    }
}

function showAddSystemPromptDialog() {
    const title = prompt('输入系统角色名称:');
    const content = prompt('输入系统提示词内容:');
    
    if (title && content) {
        addSystemPrompt(title, content);
    }
}

async function addSystemPrompt(title, content) {
    try {
        await fetch('/api/system_prompts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, content })
        });
        loadSystemPrompts();
    } catch (error) {
        console.error('Error adding system prompt:', error);
    }
}

// 修改加载对话消息函数
async function loadConversation(conversationId) {
    try {
        currentConversationId = conversationId;
        
        // 优先从本地加载
        const messages = await localDB.getMessages(conversationId);
        clearChat();
        messages.forEach(msg => {
            appendMessage(msg.content, msg.role === 'user' ? 'user' : 'bot');
        });
        
        // 后台同步服务器数据
        localDB.syncData();
    } catch (error) {
        console.error('Error loading conversation:', error);
    }
}

// 添加清除聊天内容的函数
function clearChat() {
    const chatContainer = document.getElementById('chat-container');
    chatContainer.innerHTML = '';
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 等待数据库初始化完成
        await localDB.waitForInit();
        
        // 加载所有数据
        await Promise.all([
            loadConversations(),
            loadPrompts(),
            loadSystemPrompts()
        ]);
    } catch (error) {
        console.error('初始化失败:', error);
    }
});

async function editConversationTitle(conversationId, currentTitle) {
    const newTitle = prompt('请输入新的标题（不超过10个汉字）:', currentTitle);
    if (!newTitle || newTitle === currentTitle) return;
    
    if (newTitle.length > 10) {
        alert('标题不能超过10个汉字');
        return;
    }
    
    try {
        const response = await fetch(`/api/conversations/${conversationId}/title`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title: newTitle })
        });
        
        if (response.ok) {
            loadConversations();  // 重新加载对话列表
        } else {
            const error = await response.json();
            alert(error.error || '更新标题失败');
        }
    } catch (error) {
        console.error('Error updating title:', error);
        alert('更新标题失败');
    }
}

function toggleSelectMode(type) {
    isSelectMode[type] = !isSelectMode[type];
    
    // 修正选择器
    let container, listContainer;
    switch (type) {
        case 'conversations':
            container = document.querySelector('.conversations');
            listContainer = document.getElementById('conversationList');
            break;
        case 'system-prompts':
            container = document.querySelector('.system-prompts');
            listContainer = document.getElementById('systemPromptList');
            break;
        case 'prompts':
            container = document.querySelector('.prompts');
            listContainer = document.getElementById('promptList');
            break;
    }
    
    if (!container || !listContainer) {
        console.error('Container or list not found:', type);
        return;
    }
    
    const toggleBtn = container.querySelector('.toggle-select');
    const deleteBtn = container.querySelector('.delete-selected');
    
    if (isSelectMode[type]) {
        listContainer.classList.add('select-mode');
        toggleBtn.textContent = '取消';
        deleteBtn.style.display = 'block';
        
        // 显示所有复选框
        listContainer.querySelectorAll('.item-checkbox').forEach(cb => {
            cb.style.display = 'inline-block';
        });
        
        // 隐藏编辑和删除按钮
        listContainer.querySelectorAll('.edit-button, .delete-button').forEach(btn => {
            btn.style.display = 'none';
        });
    } else {
        listContainer.classList.remove('select-mode');
        toggleBtn.textContent = '多选';
        deleteBtn.style.display = 'none';
        
        // 隐藏所有复选框并取消选中
        listContainer.querySelectorAll('.item-checkbox').forEach(cb => {
            cb.style.display = 'none';
            cb.checked = false;
        });
        
        // 恢复编辑和删除按钮
        listContainer.querySelectorAll('.edit-button, .delete-button').forEach(btn => {
            btn.style.display = '';
        });
    }
}

async function deleteSelectedItems(type) {
    // 修正选择器
    let listContainer;
    switch (type) {
        case 'conversations':
            listContainer = document.getElementById('conversationList');
            break;
        case 'system-prompts':
            listContainer = document.getElementById('systemPromptList');
            break;
        case 'prompts':
            listContainer = document.getElementById('promptList');
            break;
        default:
            console.error('Unknown type:', type);
            return;
    }
    
    if (!listContainer) {
        console.error('List container not found:', type);
        return;
    }
    
    const selectedItems = Array.from(listContainer.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => cb.value);
    
    if (!selectedItems.length) {
        alert('请选择要删除的项目');
        return;
    }
    
    if (!confirm(`确定要删除选中的 ${selectedItems.length} 个项目吗？`)) {
        return;
    }
    
    try {
        // 修正 URL 中的连字符为下划线
        const apiType = type.replace('-', '_');
        
        const response = await fetch(`/api/${apiType}/batch-delete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ids: selectedItems })
        });
        
        if (response.ok) {
            // 重新加载列表
            switch (type) {
                case 'conversations':
                    loadConversations();
                    break;
                case 'system-prompts':
                    loadSystemPrompts();
                    break;
                case 'prompts':
                    loadPrompts();
                    break;
            }
            // 退出选择模式
            toggleSelectMode(type);
        } else {
            alert('删除失败');
        }
    } catch (error) {
        console.error('Error deleting items:', error);
        alert('删除失败');
    }
}

async function deleteItem(type, id) {
    if (!confirm('确定要删除这个项目吗？')) {
        return;
    }
    
    // 修正 URL 中的连字符为下划线
    const apiType = type.replace('-', '_');
    
    try {
        const response = await fetch(`/api/${apiType}/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            // 重新加载列表
            switch (type) {
                case 'conversations':
                    loadConversations();
                    break;
                case 'system-prompts':
                    loadSystemPrompts();
                    break;
                case 'prompts':
                    loadPrompts();
                    break;
            }
        } else {
            alert('删除失败');
        }
    } catch (error) {
        console.error('Error deleting item:', error);
        alert('删除失败');
    }
}

function updateConversationList(conversations) {
    const conversationList = document.getElementById('conversationList');
    conversationList.innerHTML = '';
    
    conversations.forEach(conv => {
        const div = document.createElement('div');
        div.className = 'conversation-item';
        
        // 添加复选框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'item-checkbox';
        checkbox.value = conv.id;
        div.appendChild(checkbox);
        
        // 创建标题显示元素
        const titleSpan = document.createElement('span');
        titleSpan.textContent = conv.title || '未命名对话';
        titleSpan.onclick = () => loadConversation(conv.id);
        
        // 创建编辑按钮
        const editButton = document.createElement('button');
        editButton.className = 'edit-button';
        editButton.innerHTML = '✎';  // 使用编辑图标
        editButton.title = '编辑标题';  // 添加提示文本
        editButton.onclick = (e) => {
            e.stopPropagation();
            editConversationTitle(conv.id, conv.title);
        };
        
        // 添加删除按钮
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.innerHTML = '🗑️';
        deleteButton.title = '删除对话';
        deleteButton.onclick = (e) => {
            e.stopPropagation();
            deleteItem('conversations', conv.id);
        };
        
        div.appendChild(titleSpan);
        div.appendChild(editButton);
        div.appendChild(deleteButton);
        
        // 如果是当前选中的对话，添加active类
        if (conv.id === currentConversationId) {
            div.classList.add('active');
        }
        
        conversationList.appendChild(div);
    });
}

// 添加事件监听器处理键盘事件
document.getElementById('userInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        if (e.shiftKey) {
            // Shift+Enter: 插入换行符
            return;  // 让浏览器处理默认行为
        } else {
            // Enter: 发送消息
            e.preventDefault();  // 阻止默认的换行行为
            sendMessage();
        }
    }
});

// 添加自动调整输入框高度的功能
document.getElementById('userInput').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// 修改 setupInputTranslation 函数
function setupInputTranslation() {
    const inputContainer = document.querySelector('.input-container');
    
    // 创建按钮组容器
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'input-buttons';
    
    // 创建翻译按钮
    const translateBtn = document.createElement('button');
    translateBtn.className = 'translate-btn';
    translateBtn.innerHTML = '翻译';
    translateBtn.onclick = (e) => showTranslateOptions(null, null, e);
    
    // 创建发送按钮
    const sendButton = document.createElement('button');
    sendButton.className = 'send-btn';
    sendButton.innerHTML = '发送';
    sendButton.onclick = sendMessage;
    
    // 将按钮添加到按钮组
    buttonsContainer.appendChild(translateBtn);
    buttonsContainer.appendChild(sendButton);
    
    // 替换原有的发送按钮
    const oldSendButton = inputContainer.querySelector('button');
    if (oldSendButton) {
        oldSendButton.remove();
    }
    
    // 添加按钮组到容器
    inputContainer.appendChild(buttonsContainer);
    
    // 创建语言选择下拉菜单
    const dropdown = document.createElement('div');
    dropdown.className = 'translate-dropdown';
    dropdown.innerHTML = `
        <button data-lang="en">翻译成英文</button>
        <button data-lang="ja">翻译成日文</button>
        <button data-lang="ko">翻译成韩文</button>
        <button data-lang="zh">翻译成中文</button>
    `;
    inputContainer.appendChild(dropdown);
}

// 修改 showTranslateOptions 函数
function showTranslateOptions(messageDiv = null, content = null, event) {
    const dropdown = document.querySelector('.translate-dropdown');
    const allDropdowns = document.querySelectorAll('.translate-dropdown');
    
    // 隐藏所有其他下拉菜单
    allDropdowns.forEach(d => {
        if (d !== dropdown) d.classList.remove('show');
    });
    
    // 根据点击位置设置下拉菜单位置
    if (event) {
        const rect = event.target.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.left = `${event.clientX}px`;
        dropdown.style.top = `${event.clientY}px`;
    }
    
    // 切换显示状态
    dropdown.classList.toggle('show');
    
    // 更新点击处理程序
    dropdown.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
            const targetLang = btn.dataset.lang;
            if (messageDiv) {
                translateMessage(messageDiv, content, targetLang);
            } else {
                translateInput(targetLang);
            }
            dropdown.classList.remove('show');
        };
    });
}

// 翻译输入框内容
async function translateInput(targetLang) {
    const input = document.getElementById('userInput');
    const content = input.value.trim();
    if (!content) return;
    
    try {
        const translation = await translateText(content, targetLang);
        input.value = translation;
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
    } catch (error) {
        console.error('Translation error:', error);
        alert('翻译失败，请稍后重试');
    }
}

// 翻译消息内容
async function translateMessage(messageDiv, content, targetLang) {
    try {
        const translation = await translateText(content, targetLang);
        const contentDiv = messageDiv.querySelector('.message-content');
        
        // 保存原始内容
        if (!messageDiv.dataset.originalContent) {
            messageDiv.dataset.originalContent = content;
        }
        
        // 更新显示内容
        if (messageDiv.classList.contains('bot-message')) {
            contentDiv.innerHTML = marked.parse(translation);
        } else {
            contentDiv.textContent = translation;
        }
        
        // 添加恢复原文按钮
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'restore-btn';
        restoreBtn.textContent = '显示原文';
        restoreBtn.onclick = () => {
            if (messageDiv.classList.contains('bot-message')) {
                contentDiv.innerHTML = marked.parse(messageDiv.dataset.originalContent);
            } else {
                contentDiv.textContent = messageDiv.dataset.originalContent;
            }
            restoreBtn.remove();
        };
        
        messageDiv.appendChild(restoreBtn);
    } catch (error) {
        console.error('Translation error:', error);
        alert('翻译失败，请稍后重试');
    }
}

// 调用翻译 API
async function translateText(text, targetLang) {
    if (!apiKey) {
        throw new Error('请先设置 API Key');
    }
    
    const prompt = `请将以下文本翻译成${getLangName(targetLang)}，只返回翻译结果：\n\n${text}`;
    
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
        },
        body: JSON.stringify({
            message: prompt,
            conversation_id: null,
            system_prompt: "你是一个专业的翻译，请直接返回翻译结果，不要添加任何解释或说明。"
        })
    });
    
    const data = await response.json();
    return data.response;
}

// 获取语言名称
function getLangName(langCode) {
    const langNames = {
        'en': '英文',
        'ja': '日文',
        'ko': '韩文',
        'zh': '中文'
    };
    return langNames[langCode] || langCode;
}

// 在页面加载时初始化翻译功能
document.addEventListener('DOMContentLoaded', () => {
    setupInputTranslation();
    
    // 点击页面其他地方时关闭下拉菜单
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.translate-btn') && !e.target.closest('.translate-dropdown')) {
            document.querySelectorAll('.translate-dropdown').forEach(d => {
                d.classList.remove('show');
            });
        }
    });
});

// 在页面加载时初始化设置
document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const modelSelect = document.getElementById('modelSelect');
    const saveApiKeyBtn = document.getElementById('saveApiKey');
    
    // 加载保存的设置
    if (apiKey) {
        apiKeyInput.value = apiKey;
    }
    const savedModel = localStorage.getItem('gemini_model');
    if (savedModel) {
        modelSelect.value = savedModel;
    }
    
    // 保存设置
    saveApiKeyBtn.onclick = () => {
        const newApiKey = apiKeyInput.value.trim();
        const selectedModel = modelSelect.value;
        
        if (newApiKey) {
            apiKey = newApiKey;
            localStorage.setItem('gemini_api_key', apiKey);
            localStorage.setItem('gemini_model', selectedModel);
            alert('设置已保存');
        } else {
            alert('请输入有效的 API Key');
        }
    };
});

// 添加滚动监听
document.addEventListener('DOMContentLoaded', () => {
    const promptEditor = document.querySelector('.system-prompt-editor');
    const chatContainer = document.getElementById('chat-container');
    
    chatContainer.addEventListener('scroll', () => {
        if (chatContainer.scrollTop > 0) {
            promptEditor.classList.add('scrolled');
        } else {
            promptEditor.classList.remove('scrolled');
        }
    });
}); 