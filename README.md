# Linnea Desktop Pet

Windows 桌面宠物应用，包含 Q 版 Linnea 桌宠窗口、AI 对话、待办草案确认、日历排程、总结视图、本地提醒、Windows 系统通知和设置面板。

## Description

Linnea 是一个面向 Windows 的桌面宠物应用。它将透明桌宠、对话助手、待办记录、日历时间线、每日总结和系统提醒整合在一起，适合用来陪伴式整理当天任务。

当前版本支持：

- 透明桌宠窗口、拖动定位、单击气泡对话、双击打开主窗口。
- AI 任务记录两阶段流程：先生成待办草案，用户确认后才写入本地数据库。
- 独立待办页，支持范围过滤、项目/标签/优先级、右侧详情编辑、子任务、重复规则、备注和附件字段。
- 日历页支持日/周/月视图、任务池拖拽排程、截止时间与计划时间分离、风险任务标红提示。
- 总结页支持今天/本周/本月视图，展示计划、复盘指标和风险收件箱。
- 支持 DeepSeek、OpenAI 或自定义 OpenAI-compatible 提供商、Base URL、模型和 API Key。
- 支持快捷键快速唤出 AI 记录气泡，默认 `CommandOrControl+Shift+Space`。
- 支持 GitHub 新版本检查、跳过当前版本、手动检查更新。
- Windows 系统通知和桌宠提醒气泡，提醒气泡跟随全局主题颜色。
- 主题颜色、自定义桌宠形象文件夹、清除对话等设置。

## Release

最新版本：`v1.0.0`

Windows 安装包由 `electron-builder` 生成，文件名为 `Linnea Setup 1.0.0.exe`。

## Run

```powershell
npm install
npm run dev
```

生产构建：

```powershell
npm run build
npx electron .
```

## AI Provider

默认提供商为 DeepSeek。优先读取系统环境变量：

```powershell
$env:DEEPSEEK_API_KEY="sk-..."
```

也可以在应用设置面板里填写 API Key、Base URL 和模型名称。自定义提供商需要兼容 OpenAI Chat Completions API。

默认模型为 `deepseek-v4-flash`。如需更强模型，可在应用设置中修改。

## Character Asset Direction

当前版本内置 PNG 状态素材，默认位置在 `src/assets/pet/linnea_state`。也可以在设置中选择自定义桌宠形象文件夹。

建议 AI 资产提示词：

```text
Q版 Linnea 桌面宠物，完整复刻角色的具体服装、标志、发饰和官方构图特征，浅色头发，冒险者服装，岩元素灵感金色徽章，小背包装饰，可爱二头身比例，正面站姿，透明背景，适合 Windows 桌面宠物，清晰边缘，无文字，无水印。
```

如果用于公开发布，请确认素材授权；当前项目默认按个人本地使用处理。
