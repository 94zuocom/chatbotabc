class LocalDB {
    constructor() {
        this.db = null;
        this.DB_NAME = 'chatbot_db';
        this.DB_VERSION = 1;
        this.lastSyncTime = 0;
        this.SYNC_INTERVAL = 60000; // 1分钟
        
        // 初始化承诺
        this.initPromise = this.init();
        // 启动定时同步
        setInterval(() => this.syncData(), this.SYNC_INTERVAL);
    }
    
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 创建存储对象
                if (!db.objectStoreNames.contains('conversations')) {
                    const conversationStore = db.createObjectStore('conversations', { keyPath: 'id' });
                    conversationStore.createIndex('updated_at', 'updated_at');
                }
                
                if (!db.objectStoreNames.contains('messages')) {
                    const messageStore = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                    messageStore.createIndex('conversation_id', 'conversation_id');
                    messageStore.createIndex('updated_at', 'updated_at');
                }
            };
        });
    }
    
    // 等待初始化完成的辅助方法
    async waitForInit() {
        await this.initPromise;
    }
    
    // 添加或更新对话
    async saveConversation(conversation) {
        await this.waitForInit();
        conversation.updated_at = Date.now();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('conversations', 'readwrite');
            const store = tx.objectStore('conversations');
            const request = store.put(conversation);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    // 添加消息
    async saveMessage(message) {
        await this.waitForInit();
        message.updated_at = Date.now();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('messages', 'readwrite');
            const store = tx.objectStore('messages');
            const request = store.put(message);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    // 获取对话列表
    async getConversations() {
        await this.waitForInit();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('conversations', 'readonly');
            const store = tx.objectStore('conversations');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    // 获取对话的消息
    async getMessages(conversationId) {
        await this.waitForInit();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('messages', 'readonly');
            const store = tx.objectStore('messages');
            const index = store.index('conversation_id');
            const request = index.getAll(IDBKeyRange.only(conversationId));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    // 同步数据
    async syncData() {
        const currentTime = Date.now();
        
        try {
            // 获取本地更新的数据
            const localUpdates = await this.getUpdatedData(this.lastSyncTime);
            
            // 获取服务器更新的数据
            const response = await fetch('/api/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    last_sync: this.lastSyncTime,
                    updates: localUpdates
                })
            });
            
            const serverUpdates = await response.json();
            
            // 更新本地数据
            await this.applyServerUpdates(serverUpdates);
            
            this.lastSyncTime = currentTime;
        } catch (error) {
            console.error('Sync failed:', error);
        }
    }
    
    // 获取本地更新的数据
    async getUpdatedData(lastSync) {
        const updates = {
            conversations: [],
            messages: []
        };
        
        // 获取更新的对话
        const convTx = this.db.transaction('conversations', 'readonly');
        const convStore = convTx.objectStore('conversations');
        const convIndex = convStore.index('updated_at');
        updates.conversations = await convIndex.getAll(IDBKeyRange.lowerBound(lastSync));
        
        // 获取更新的消息
        const msgTx = this.db.transaction('messages', 'readonly');
        const msgStore = msgTx.objectStore('messages');
        const msgIndex = msgStore.index('updated_at');
        updates.messages = await msgIndex.getAll(IDBKeyRange.lowerBound(lastSync));
        
        return updates;
    }
    
    // 应用服务器更新
    async applyServerUpdates(updates) {
        // 更新对话
        const convTx = this.db.transaction('conversations', 'readwrite');
        const convStore = convTx.objectStore('conversations');
        for (const conv of updates.conversations) {
            await convStore.put(conv);
        }
        
        // 更新消息
        const msgTx = this.db.transaction('messages', 'readwrite');
        const msgStore = msgTx.objectStore('messages');
        for (const msg of updates.messages) {
            await msgStore.put(msg);
        }
    }
}

// 创建全局实例
const localDB = new LocalDB(); 