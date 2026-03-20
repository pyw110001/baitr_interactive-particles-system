<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8db4ee75-5eb9-4f4b-b38c-5617a649ff68

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## 多终端同步（PAD 控制 + 电脑显示）

1. **终端 A — 同步中继（Node + WebSocket，默认 `8081`）**  
   `npm run sync-server`

2. **终端 B — 前端（Vite，默认 `3000`）**  
   `npm run dev`

3. **单机模式（默认）**：侧边栏保持「单机」，或不传 `role` 参数。不连接 `8081`，本地鼠标/触摸照常驱动粒子。

4. **同房间联机**
   - 电脑浏览器打开：`http://<电脑IP>:3000/?role=display&room=demo`（或在侧边栏选「PC 显示端」+ 填 roomId）
   - PAD 浏览器打开：`http://<电脑IP>:3000/?role=controller&room=demo&compact=1`（侧边栏可选「PAD 控制端」）
   - 若 PAD 必须用其他域名打开页面，请在侧边栏填写 **同步服务** 为 `ws://<电脑IP>:8081`，或 URL 加 `&ws=ws://<电脑IP>:8081`。

5. **坐标**：控制端在**画布可见区域**内上报 `nx, ny ∈ [0,1]`，显示端按当前 `width/height` 映射为像素后接入现有涡旋力场。

6. **扩展多点触控**：已在每条消息中带 `pointerId`；后续可在控制端对 `touchmove` / `pointermove` 的 **每一个** `Touch` / `pointerId` 分别调用 `setLocalPointer`，并在显示端沿用 `originId:pointerId` 作为键，即可多指并行涡旋（当前首版仍以单指路径为主，数据结构已预留）。
