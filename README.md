# Linnea Desktop Pet

Windows 桌面宠物 MVP，包含 Q 版 Linnea 桌宠窗口、文字对话、待办自动记录、本地提醒、Windows 系统通知和设置面板。

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

## DeepSeek

优先读取系统环境变量：

```powershell
$env:DEEPSEEK_API_KEY="sk-..."
```

也可以在应用设置面板里填写 API Key。未配置 API Key 时，应用会使用本地关键词规则做基础待办记录。

默认模型为 `deepseek-v4-flash`。如需更强模型，可在本机应用配置中改为 `deepseek-v4-pro`。

## Character Asset Direction

当前版本内置一个 SVG Q 版占位形象，位置在 `src/main.tsx` 的 `LinneaPet` 组件。后续可以替换为 PNG/WebP/Live2D。

建议 AI 资产提示词：

```text
Q版 Linnea 桌面宠物，完整复刻角色的具体服装、标志、发饰和官方构图特征，浅色头发，冒险者服装，岩元素灵感金色徽章，小背包装饰，可爱二头身比例，正面站姿，透明背景，适合 Windows 桌面宠物，清晰边缘，无文字，无水印。
```

如果用于公开发布，请确认素材授权；当前项目默认按个人本地使用处理。
