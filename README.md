# 林深处 · 黄昏森林原木小屋（Phase 0+1 骨架版）

单页 WebGL 场景：黄昏时分，森林深处的小木屋。three.js + TypeScript + Vite。
**零外部媒体依赖** — 全部纹理 canvas 程序生成，音频将用 Web Audio 合成（无下载、无 API）。

## 运行

```bash
npm install        # 建议国内镜像：--registry=https://registry.npmmirror.com
npm run dev        # 开发预览（默认 http://localhost:5173）
npm run build      # tsc --noEmit && vite build
npm run preview    # 预览构建产物
```

## 操作

- 鼠标/触摸拖拽 — 360° 环绕；滚轮/双指 — 推拉（2.2–45m）
- 双击 — 定格观察目标；键盘 `1-4` — 黄昏/蓝调/夜晚/黎明 预设

## URL 参数

| 参数 | 说明 |
|------|------|
| `?t=秒` (0–86400) | 一天中的时刻，clock 时钟模式 |
| `?light=dusk\|blue\|night\|dawn` | 光线预设 |
| `?q=low\|medium\|high\|ultra` | 画质档（默认自动） |
| `?shot=1` | 截屏确定性模式（无漂移、遮罩隐藏） |
| `?bench=1` | 性能采样，结果写入 `<script id="__forest_bench">` |
| `?yaw=&dist=` | 镜头方位/距离 |
| `?cam=x,y,z,tx,ty,tz` | 相机定点模式 |
| `?inside=1` | 室内模式（Phase 4 生效） |

## 当前状态（Phase 0+1）

- 天穹 shader（太阳辉光/星/月/云）、380m 地形+台地、远山两层、贴地雾片
- 气候系统：6 锚点晨昏双配色，1-4 预设平滑过渡，日→月单灯插值
- 环绕相机：拖拽/推拉/双击定格/呼吸漂移/碰撞
- 构建体积 gzip ~142KB（预算 220KB）；tsc 严格模式通过

阶段计划与踩坑记录见 `docs/plans/PROGRESS.md` 与 `docs/research/tech-selection.md`。
