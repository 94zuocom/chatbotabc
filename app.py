from flask import Flask, request, jsonify, render_template
import sqlite3
import json
import urllib.request
from datetime import datetime
import time
import google.generativeai as genai
import pathlib
import textwrap
import os

app = Flask(__name__)

# 修改代理配置部分
# 设置代理环境变量
PROXY_HOST = "127.0.0.1"
PROXY_PORT = "9988"
os.environ["HTTPS_PROXY"] = f"http://{PROXY_HOST}:{PROXY_PORT}"

def init_db():
    conn = sqlite3.connect('chatbot.db')
    c = conn.cursor()
    
    # 创建对话历史表
    c.execute('''CREATE TABLE IF NOT EXISTS conversations
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  title TEXT,
                  system_prompt_id INTEGER REFERENCES system_prompts(id),
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    
    # 创建消息表
    c.execute('''CREATE TABLE IF NOT EXISTS messages
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  conversation_id INTEGER,
                  role TEXT,
                  content TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (conversation_id) REFERENCES conversations(id))''')
    
    # 创建提示词表
    c.execute('''CREATE TABLE IF NOT EXISTS prompts
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  title TEXT,
                  content TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    
    # 添加系统提示词表
    c.execute('''CREATE TABLE IF NOT EXISTS system_prompts
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  title TEXT,
                  content TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    
    # 初始化一些默认的系统提示词
    default_prompts = [
        ("默认助手", "作为一个AI助手，我会尽可能地提供准确、有帮助的回答。"),
        ("代码专家", "作为一个专业的程序员，我会用清晰的代码和详细的解释来帮助你解决编程问题。我擅长编写简洁、易懂的代码，并能解释每段代码的工作原理。"),
        ("中文翻译", "作为一个专业的翻译，我会将其他语言准确地翻译成地道的中文。我会注意保持原文的意思，同时确保翻译后的文字符合中文的表达习惯。"),
        ("数学导师", "作为一个数学老师，我会用简单易懂的方式解释数学概念。我会通过具体的例子和步骤分解来帮助你理解复杂的数学问题。")
    ]
    
    # 使用INSERT OR IGNORE避免重复插入
    c.executemany('INSERT OR IGNORE INTO system_prompts (title, content) VALUES (?, ?)',
                  default_prompts)
    
    conn.commit()
    conn.close()

def migrate_db():
    """安全地迁移数据库"""
    conn = sqlite3.connect('chatbot.db')
    c = conn.cursor()
    
    try:
        # 备份现有数据
        c.execute('SELECT * FROM conversations')
        conversations = c.fetchall()
        c.execute('SELECT * FROM messages')
        messages = c.fetchall()
        c.execute('SELECT * FROM prompts')
        prompts = c.fetchall()
        c.execute('SELECT * FROM system_prompts')
        system_prompts = c.fetchall()
        
        # 重命名现有表
        c.execute('ALTER TABLE conversations RENAME TO conversations_old')
        c.execute('ALTER TABLE messages RENAME TO messages_old')
        c.execute('ALTER TABLE prompts RENAME TO prompts_old')
        c.execute('ALTER TABLE system_prompts RENAME TO system_prompts_old')
        
        # 创建新表
        c.execute('''CREATE TABLE conversations
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      title TEXT,
                      system_prompt_id INTEGER REFERENCES system_prompts(id),
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        
        c.execute('''CREATE TABLE messages
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      conversation_id INTEGER,
                      role TEXT,
                      content TEXT,
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      FOREIGN KEY (conversation_id) REFERENCES conversations(id))''')
        
        c.execute('''CREATE TABLE prompts
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      title TEXT,
                      content TEXT,
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        
        c.execute('''CREATE TABLE system_prompts
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      title TEXT,
                      content TEXT,
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        
        # 迁移数据
        c.executemany('''INSERT INTO conversations (id, title, system_prompt_id, created_at) 
                        VALUES (?, ?, ?, ?)''', conversations)
        
        c.executemany('''INSERT INTO messages (id, conversation_id, role, content, created_at) 
                        VALUES (?, ?, ?, ?, ?)''', messages)
        
        c.executemany('''INSERT INTO prompts (id, title, content, created_at) 
                        VALUES (?, ?, ?, ?)''', prompts)
        
        c.executemany('''INSERT INTO system_prompts (id, title, content, created_at) 
                        VALUES (?, ?, ?, ?)''', system_prompts)
        
        # 删除旧表
        c.execute('DROP TABLE conversations_old')
        c.execute('DROP TABLE messages_old')
        c.execute('DROP TABLE prompts_old')
        c.execute('DROP TABLE system_prompts_old')
        
        conn.commit()
        print("数据库迁移成功")
    except Exception as e:
        print(f"迁移失败: {e}")
        conn.rollback()
    finally:
        conn.close()

@app.route('/')
def home():
    return render_template('index.html')

def init_genai(api_key):
    """初始化 Gemini API"""
    # 配置 Gemini
    genai.configure(api_key=api_key)
    
    # 从请求头获取模型名称
    model_name = request.headers.get('X-Model-Name', 'gemini-2.0-pro-exp-02-05')
    
    # 创建模型实例
    model = genai.GenerativeModel(model_name)
    
    # 打印配置信息
    print("\n=== Gemini 配置信息 ===")
    print(f"代理: {os.environ.get('HTTPS_PROXY')}")
    print(f"模型: {model.model_name}")
    
    return model

def generate_content(api_key, message, system_prompt=None, max_retries=3, retry_delay=5):
    """使用 Gemini API 生成内容"""
    try:
        model = init_genai(api_key)
        
        # 构建消息内容
        prompt = message
        if system_prompt:
            prompt = f"{system_prompt}\n\n{message}"
        
        # 打印请求信息
        print("\n=== API 请求信息 ===")
        print("Prompt:", json.dumps(prompt, ensure_ascii=False, indent=2))
        
        # 生成响应
        response = model.generate_content(
            prompt,
            generation_config={
                "temperature": 0.9,
                "top_p": 0.95,
                "top_k": 64,
                "max_output_tokens": 8192,
            },
            safety_settings={
                "HARM_CATEGORY_HARASSMENT": "block_none",
                "HARM_CATEGORY_HATE_SPEECH": "block_none",
                "HARM_CATEGORY_SEXUALLY_EXPLICIT": "block_none",
                "HARM_CATEGORY_DANGEROUS_CONTENT": "block_none"
            }
        )
        
        # 打印响应信息
        print("\n=== API 响应信息 ===")
        print("Response:", response.text)
        
        return response.text
        
    except Exception as e:
        print(f"\n=== API 错误 ===\n{str(e)}")
        if "429" in str(e):  # Rate limit error
            if max_retries > 0:
                print(f"遇到限流，{retry_delay}秒后重试...")
                time.sleep(retry_delay)
                return generate_content(api_key, message, system_prompt, max_retries-1, retry_delay*2)
        return f"API调用失败: {str(e)}"

def generate_title(conversation, api_key):
    """使用 Gemini 生成对话标题"""
    prompt = f"""基于以下对话内容生成一个不超过10个汉字的标题（不要加引号）：
用户：{conversation.split('\n')[0]}
AI：{conversation.split('\n')[1]}"""
    
    title = generate_content(api_key, prompt)
    if title.startswith('API调用失败'):
        return f"新对话 {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    
    return title.strip().strip('"\'').strip()[:20]

# 修改数据库连接函数
def get_db_connection(max_retries=5, retry_delay=0.2):
    """获取数据库连接，带重试机制"""
    for attempt in range(max_retries):
        try:
            # 增加超时时间，启用WAL模式
            conn = sqlite3.connect('chatbot.db', timeout=30.0, isolation_level=None)
            conn.execute('PRAGMA journal_mode=WAL')  # 使用WAL模式减少锁定
            conn.execute('PRAGMA busy_timeout=30000')  # 设置忙等待超时为30秒
            conn.row_factory = sqlite3.Row
            return conn
        except sqlite3.OperationalError as e:
            if 'database is locked' in str(e) and attempt < max_retries - 1:
                print(f"数据库被锁定，第{attempt + 1}次重试...")
                time.sleep(retry_delay * (attempt + 1))  # 递增延迟
                continue
            raise
    raise sqlite3.OperationalError("无法连接到数据库，请稍后重试")

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    api_key = request.headers.get('X-API-Key')
    
    if not api_key:
        return jsonify({'error': 'Missing API Key'}), 401
    
    message = data.get('message')
    conversation_id = data.get('conversation_id')
    system_prompt = data.get('system_prompt', "你是一个有帮助的AI助手。")
    
    conn = None
    try:
        conn = get_db_connection()
        with conn:  # 使用上下文管理器自动处理事务
            c = conn.cursor()
            
            # 检查是否是第一条消息
            c.execute('SELECT COUNT(*) FROM messages WHERE conversation_id = ?', (conversation_id,))
            is_first_message = c.fetchone()[0] == 0
            
            # 保存用户消息
            c.execute('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
                     (conversation_id, 'user', message))
            
            # 获取AI响应
            response_text = generate_content(api_key, message, system_prompt=system_prompt)
            
            # 保存AI响应
            c.execute('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
                     (conversation_id, 'assistant', response_text))
            
            # 如果是第一次对话，生成标题
            if is_first_message:
                title = generate_title(message + "\n" + response_text, api_key)
                c.execute('UPDATE conversations SET title = ? WHERE id = ?', (title, conversation_id))
        
        return jsonify({
            'response': response_text,
            'is_first_message': is_first_message
        })
        
    except sqlite3.OperationalError as e:
        print(f"数据库错误: {e}")
        return jsonify({'error': '数据库访问错误，请稍后重试'}), 500
    except Exception as e:
        print(f"未知错误: {e}")
        return jsonify({'error': '发生错误，请稍后重试'}), 500
    finally:
        if conn:
            try:
                conn.close()
            except Exception as e:
                print(f"关闭数据库连接时出错: {e}")

@app.route('/api/conversations', methods=['GET', 'POST'])
def handle_conversations():
    conn = sqlite3.connect('chatbot.db')
    c = conn.cursor()
    
    if request.method == 'POST':
        data = request.json
        system_prompt_id = data.get('system_prompt_id')
        title = f"新对话 {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        
        c.execute('INSERT INTO conversations (title, system_prompt_id) VALUES (?, ?)',
                 (title, system_prompt_id))
        conn.commit()
        conversation_id = c.lastrowid
        result = {'id': conversation_id, 'title': title}
    else:
        c.execute('''SELECT c.*, sp.title as prompt_title 
                    FROM conversations c 
                    LEFT JOIN system_prompts sp ON c.system_prompt_id = sp.id 
                    ORDER BY c.created_at DESC''')
        result = [{'id': r[0], 'title': r[1], 'system_prompt': r[3]} for r in c.fetchall()]
    
    conn.close()
    return jsonify(result)

@app.route('/api/conversations/<int:conversation_id>/messages', methods=['GET'])
def get_conversation_messages(conversation_id):
    conn = sqlite3.connect('chatbot.db')
    c = conn.cursor()
    c.execute('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at', (conversation_id,))
    messages = [{'role': m[0], 'content': m[1]} for m in c.fetchall()]
    conn.close()
    return jsonify(messages)

@app.route('/api/prompts', methods=['GET', 'POST'])
def handle_prompts():
    conn = sqlite3.connect('chatbot.db')
    c = conn.cursor()
    
    if request.method == 'POST':
        data = request.json
        c.execute('INSERT INTO prompts (title, content) VALUES (?, ?)',
                 (data['title'], data['content']))
        conn.commit()
        result = {'status': 'success'}
    else:
        c.execute('SELECT * FROM prompts ORDER BY created_at DESC')
        result = [{'id': r[0], 'title': r[1], 'content': r[2]} for r in c.fetchall()]
    
    conn.close()
    return jsonify(result)

# 添加修改标题的路由
@app.route('/api/conversations/<int:conversation_id>/title', methods=['PUT'])
def update_conversation_title(conversation_id):
    data = request.json
    new_title = data.get('title', '').strip()
    
    if not new_title:
        return jsonify({'error': '标题不能为空'}), 400
    
    if len(new_title) > 20:
        return jsonify({'error': '标题不能超过10个汉字'}), 400
        
    conn = sqlite3.connect('chatbot.db')
    c = conn.cursor()
    c.execute('''UPDATE conversations 
                 SET title = ?, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?''', (new_title, conversation_id))
    conn.commit()
    conn.close()
    
    return jsonify({'status': 'success', 'title': new_title})

# 添加系统提示词相关的路由
@app.route('/api/system_prompts', methods=['GET', 'POST'])
def handle_system_prompts():
    conn = sqlite3.connect('chatbot.db')
    c = conn.cursor()
    
    if request.method == 'POST':
        data = request.json
        c.execute('INSERT INTO system_prompts (title, content) VALUES (?, ?)',
                 (data['title'], data['content']))
        conn.commit()
        result = {'status': 'success'}
    else:
        c.execute('SELECT * FROM system_prompts ORDER BY created_at DESC')
        result = [{'id': r[0], 'title': r[1], 'content': r[2]} for r in c.fetchall()]
    
    conn.close()
    return jsonify(result)

@app.route('/api/system_prompts/<int:prompt_id>', methods=['PUT'])
def update_system_prompt(prompt_id):
    data = request.json
    title = data.get('title')
    content = data.get('content')
    
    if not title or not content:
        return jsonify({'error': '标题和内容不能为空'}), 400
    
    conn = sqlite3.connect('chatbot.db')
    c = conn.cursor()
    c.execute('UPDATE system_prompts SET title = ?, content = ? WHERE id = ?',
              (title, content, prompt_id))
    conn.commit()
    conn.close()
    
    return jsonify({'status': 'success'})

@app.route('/api/conversations/<int:conversation_id>', methods=['DELETE'])
def delete_conversation(conversation_id):
    conn = sqlite3.connect('chatbot.db')
    c = conn.cursor()
    c.execute('DELETE FROM messages WHERE conversation_id = ?', (conversation_id,))
    c.execute('DELETE FROM conversations WHERE id = ?', (conversation_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/conversations/batch-delete', methods=['POST'])
def batch_delete_conversations():
    data = request.json
    ids = data.get('ids', [])
    
    conn = sqlite3.connect('chatbot.db')
    c = conn.cursor()
    for id in ids:
        c.execute('DELETE FROM messages WHERE conversation_id = ?', (id,))
        c.execute('DELETE FROM conversations WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/system_prompts/<int:prompt_id>', methods=['DELETE'])
def delete_system_prompt(prompt_id):
    conn = sqlite3.connect('chatbot.db')
    c = conn.cursor()
    c.execute('DELETE FROM system_prompts WHERE id = ?', (prompt_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/system_prompts/batch-delete', methods=['POST'])
def batch_delete_system_prompts():
    data = request.json
    ids = data.get('ids', [])
    
    conn = sqlite3.connect('chatbot.db')
    c = conn.cursor()
    for id in ids:
        c.execute('DELETE FROM system_prompts WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/prompts/<int:prompt_id>', methods=['DELETE'])
def delete_prompt(prompt_id):
    conn = sqlite3.connect('chatbot.db')
    c = conn.cursor()
    c.execute('DELETE FROM prompts WHERE id = ?', (prompt_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/prompts/batch-delete', methods=['POST'])
def batch_delete_prompts():
    data = request.json
    ids = data.get('ids', [])
    
    conn = sqlite3.connect('chatbot.db')
    c = conn.cursor()
    for id in ids:
        c.execute('DELETE FROM prompts WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/sync', methods=['POST'])
def sync_data():
    data = request.json
    last_sync = data.get('last_sync', 0)
    local_updates = data.get('updates', {})
    
    conn = sqlite3.connect('chatbot.db')
    c = conn.cursor()
    
    # 应用本地更新到服务器
    for conv in local_updates.get('conversations', []):
        c.execute('''INSERT OR REPLACE INTO conversations 
                     (id, title, system_prompt_id, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)''',
                  (conv['id'], conv['title'], conv['system_prompt_id'], conv['created_at']))
    
    for msg in local_updates.get('messages', []):
        c.execute('''INSERT OR REPLACE INTO messages 
                     (id, conversation_id, role, content, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)''',
                  (msg['id'], msg['conversation_id'], msg['role'], 
                   msg['content'], msg['created_at']))
    
    # 获取服务器更新
    c.execute('''SELECT id, title, system_prompt_id, created_at, updated_at 
                 FROM conversations 
                 WHERE created_at > ? OR updated_at > ?''', 
              (last_sync, last_sync))
    server_conversations = [{
        'id': r[0],
        'title': r[1],
        'system_prompt_id': r[2],
        'created_at': r[3],
        'updated_at': r[4]
    } for r in c.fetchall()]
    
    c.execute('''SELECT id, conversation_id, role, content, created_at, updated_at 
                 FROM messages 
                 WHERE created_at > ? OR updated_at > ?''', 
              (last_sync, last_sync))
    server_messages = [{
        'id': r[0],
        'conversation_id': r[1],
        'role': r[2],
        'content': r[3],
        'created_at': r[4],
        'updated_at': r[5]
    } for r in c.fetchall()]
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'conversations': server_conversations,
        'messages': server_messages
    })

if __name__ == '__main__':
    init_db()
    migrate_db()
    app.run(debug=True) 