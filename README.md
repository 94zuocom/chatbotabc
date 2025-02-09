# AI Chat Assistant

一个基于 Gemini API 的智能聊天助手，支持多轮对话、系统角色设定、提示词管理等功能。

## 功能特点

- 🤖 支持 Gemini Pro 和 Flash 模型
- 💬 多轮对话支持
- 🎭 系统角色（System Prompt）管理
- 📝 提示词（Prompt）管理
- 🔄 实时翻译功能（支持中英日韩）
- 💾 本地数据存储和同步
- 🎨 Markdown 渲染支持
- ✏️ 消息编辑和重发功能
- 🌐 代理支持

## 安装说明

1. 克隆项目
```bash
git clone https://github.com/yourusername/ai-chat-assistant.git
cd ai-chat-assistant
```

2. 安装依赖
```bash
pip install -r requirements.txt
```

3. 配置代理（可选）
在 `app.py` 中修改代理设置：
```python
PROXY_HOST = "127.0.0.1"
PROXY_PORT = "9988"
```

4. 运行应用
```bash
python app.py
```

## 使用说明

1. 获取 API Key
- 访问 [Google AI Studio](https://makersuite.google.com/app/apikey)
- 创建并复制 API Key

2. 配置应用
- 打开应用，点击左侧边栏底部的"设置"
- 输入 API Key
- 选择模型（可选）
- 点击"保存设置"

3. 开始对话
- 点击"新建对话"
- 选择或创建系统角色（可选）
- 在输入框中输入消息并发送

4. 功能说明
- 系统角色：定义 AI 助手的行为和特征
- 提示词：保存常用的对话模板
- 翻译：支持实时翻译消息
- 编辑：可以编辑已发送的消息
- 重发：重新发送消息获取新的回复

## 技术栈

- 后端：Flask + SQLite
- 前端：原生 JavaScript + Marked.js
- API：Google Gemini API
- 存储：IndexedDB (本地) + SQLite (服务器)

## 目录结构

```
.
├── app.py              # 主应用文件
├── static/            # 静态资源
│   ├── style.css     # 样式文件
│   ├── script.js     # 主要脚本
│   └── db.js         # 数据库操作
├── templates/         # 模板文件
│   └── index.html    # 主页面
├── chatbot.db        # SQLite 数据库
└── requirements.txt   # 项目依赖
```

## 依赖项

- Flask
- google-generativeai
- sqlite3
- httpx（用于代理支持）

## 注意事项

1. API 限制
- 请遵守 Google Gemini API 的使用限制
- 建议使用代理以提高连接稳定性

2. 数据安全
- API Key 保存在浏览器本地存储中
- 对话历史同时保存在本地和服务器

3. 浏览器支持
- 推荐使用最新版本的 Chrome/Firefox/Safari
- 需要支持 IndexedDB

## 贡献指南

欢迎提交 Issue 和 Pull Request 来帮助改进项目。

## 许可证

GNU General Public License v3.0 (GPL-3.0)

本项目采用 GPL-3.0 开源许可证。这意味着您可以：

- ✅ 商业使用
- ✅ 修改源码
- ✅ 分发
- ✅ 私人使用

但必须：

- ⚠️ 公开源代码
- ⚠️ 声明原作者版权
- ⚠️ 使用相同的许可证
- ⚠️ 声明对代码的重大修改

完整许可证文本请参见项目根目录下的 [LICENSE](LICENSE) 文件或访问 [GNU GPL v3.0](https://www.gnu.org/licenses/gpl-3.0.html)。 