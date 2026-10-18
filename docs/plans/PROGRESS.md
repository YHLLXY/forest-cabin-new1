# 森林深处 · 项目进度 (PROGRESS)

> 需求书式开发：每阶段结束 → 验收 → 用户压缩上下文 → 下一阶段。
> 硬性预算：主 js ≤220KB(gzip)、场景 ≤90k 三角形、关键纹理 ≤512²。

## 阶段状态

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 地基 | three+ts+vite、URL 参数、后处理链、性能采样 | ✅ |
| P1 世界骨架 | 天穹/地形/远山/雾片/相机/气候系统 | ✅ |
| P2 小屋 | 原木结构 + 材质系统 + 树林 | ⬜ |
| P3 光影 | 光影控制面板 + 炊烟/萤火虫 | ⬜ |
| P4 室内 | 屋内陈设 + 进出屋模式 | ⬜ |
| P5 森林味道 | Web Audio 合成鸟叫/风/柴火 + 小鹿等动物 | ⬜ |
| P6 交付 | 性能门禁、README 终稿、bench 复测 | ⬜ |

## Phase 0+1 完成内容
- 中文 loading 遮罩（`来 到 林 深 之 处`）、WebGL2 检测降级提示
- 渲染链：HDR(HalfFloat+MSAA) → UnrealBloom(阈值1.05) → OutputPass(ACES+sRGB) → 显示空间 pass（色散0.0002 → 暗角0.30 → 颗粒0.04）
- 气候系统：6 锚点 × 晨昏双配色，4 预设（dusk/blue/night/dawn），键盘 1-4，1.9s 平滑过渡；单盏 DirectionalLight 日→月插值防闪烁
- 天穹 shader：渐变/太阳辉光/日轮/星(hash 方格)/月盘+月晕/云 fbm/dither 去带
- 地形 380m + 屋旁台地、canvas 程序纹理(SRGB)、12 岩石、两圈远山(手动大气透视剪影)、12 贴地雾片
- 相机：360°/俯仰 2.2-45m 指数推拉/双指/双击定格/呼吸漂移/柱体碰撞/地形 clamp
- 验收截图：docs/shots/p1_{dusk_backlit,dusk_sunward,blue,night,night_moon,dawn,ground_close}.png

## 验收数字
- tsc 严格模式通过；构建 gzip 141.94 KB（预算 220KB）
- 无页面 console 错误（含 shader 编译复核）
- 三角形/draw call 数字待补：用 Edge `--dump-dom` 抓 `<script id="__forest_bench">`

## 已知问题（可接受，进 P2）
- 夜/蓝调地平线雾带偏亮（P2 树林遮挡 + P3 面板再调）
- 月亮偶被云挡；山脊偏平滑；岩石偏暗
- 无头截图测不出真实 FPS（P6 用 playwright/CDP 复测）

## 关键教训（防复发）
- canvas 纹理必须 `colorSpace = SRGBColorSpace`
- 改 shader 后必须 grep "Shader Error"（多余 `}` 曾导致整穹渲染异常）
- 严禁 PowerShell 批量替换源码文件
- npm.ps1 被执行策略禁止 → 用 npm.cmd

## Phase 2 要做（下次上下文从这里接）
- 原木小屋程序化构建（墙/窗/门/烟囱/屋顶）、碰撞体接入 rig
- 材质系统（canvas 木纹/石纹/窗帘）
- 树林环形布置（实例化，避开屋区/视线），衔接地平线雾带
