# 森林深处 · 项目进度 (PROGRESS)

> 需求书式开发：每阶段结束 → 验收 → 用户压缩上下文 → 下一阶段。
> 硬性预算：主 js ≤220KB(gzip)、场景 ≤90k 三角形、关键纹理 ≤512²。

## 阶段状态

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 地基 | three+ts+vite、URL 参数、后处理链、性能采样 | ✅ |
| P1 世界骨架 | 天穹/地形/远山/雾片/相机/气候系统 | ✅ |
| P2 小屋 | 原木结构 + 材质系统 + 树林 | ✅ |
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

## Phase 2 完成内容
- `src/world/cabin.ts`：全程序化原木小屋 — 圆木墙体（外露圆木端头）+ 板材内墙、人字坡屋顶、山墙封板、石砌烟囱（背光下有可见石纹，不再剪影黑块）、地基石、门斗雨棚+立柱、竖板木门+门框+铁球手柄+石阶
- 生活化陈设：壁炉火堆+ 火光 PointLight（射程 3.6，防透墙漏光把门"照亮成发光门"）、火窗（窗面自发光+四格深色窗框+凸出窗台）、柴堆/凳/陶罐等小件
- `src/world/trees.ts`：实例化针叶林，环形复用网格，避开屋区与主视线，衔接远山/地平线雾带
- `src/main.ts` 接线：小屋碰撞体进 rig、气候系统对小屋灯光的接管
- 四预设验收截图：`docs/shots/p2_{dusk_backlit,dawn,blue,night}3.png` + 门特写 `p2_door_front3.png` + 近景 `p2_cabin_close.png`

## Phase 2 验收数字
- tsc 严格模式通过；构建 gzip **147.76 KB**（预算 220KB）
- bench（?bench=1 + dump-dom）：tier=high、dpr=1、**draw calls 284**（预算 ≤320）、**三角形 81,523**（预算 ≤90k）
- console 无错误、无 shader 编译错误

## P2 攻坚教训（防复发）
- **box(w,h,d) 轴向映射**：w→X、h→Y、d→Z。朝 +X 的构件必须"薄沿 X、宽沿 Z"——门框曾写反（1.18 宽沿 X）渲染成穿墙黑竖条、门板侧立不可见
- **调试定位法**：给可疑 mesh 上高饱和纯色（红门框+绿门板）近景截图，轴向错误一眼定位
- 火光 PointLight 需按"灯位→最远隔墙物"距离压低射程，否则透墙漏光
- headless bench：URL 必须 `?bench=1`（`shot=1` 不写 bench 标签）；dump-dom 输出是多行 JSON，需按行号提取而非行内正则
- 截图用 `Start-Process -FilePath msedge.exe -ArgumentList '...' -Wait -NoNewWindow`（旧 cmd /c 重定向法会失败）

## P2 已知问题（可接受）
- 背光下门板近黑（物理一致：门背对夕阳；黎明/蓝调下可辨）

## 预算修正（对照需求书原文）
- 需求书 draw call 预算：**高 ≤130 / 超高 ≤175**（此前自记"≤320"是拍脑袋，错的）——当前 284 超标，排入 3d"提亮+补光+瘦身"（合并 cabin 静态件/窗实例化收敛）
- 三角形预算：高 ≤1.0M / 超高 ≤1.4M（自记 ≤90k 过紧）——余量留给 3c 树精修（轮生枝+针叶卡片，替换"绿色圆锥"）

## Phase 3a 完成（光影面板）
- `src/ui/panel.ts`（新，~330 行）：右侧抽屉，默认收起 + `inert`；打开焦点进关闭按钮，Esc 关闭并把焦点还给手柄
- **12 滑杆**：太阳 4（方位/高度/强度/色温）· 空气 2（雾/曝光）· 灯火 3（炉火/窗灯/炊烟*）· 画面 3（颗粒/暗角/辉光）
  - 绝对值类（方位/高度/色温）：不接管时跟随气候锚点，接管后每帧锁值；倍率类乘在帧结果上，默认 ×1.00
  - 未接管的滑杆显示跟随当前帧值（打开面板即同步）；炊烟滑杆已就位、接线于 3b
- 4 预设 chips（键盘 1-4 / chip / URL 三入口同源联动，startPreset 保证初始高亮一致）+ 阴影档位（512/1024/2048/4096，换档释放旧 shadow map，否则 three 复用旧分辨率）+ 恢复默认
- localStorage 防抖 400ms 持久化；`?light=` 在场时整场不读不写（需求书要求）
- 键盘 1-4 在面板内聚焦时让路（防拖滑杆误触预设）
- 管道：climate.ts 新增 `ClimateOverride`（el/az 绝对 + sunI/fog 倍率，接进 rebuild 前保证星/月/萤火虫派生一致）；cabin.setClimate 接 fire/win 倍率；post.setDisplayFX 接颗粒/暗角（基调 0.04/0.30，钳 0.12/0.62）
- 数字：构建 gzip **150.76 KB**（+3KB / 预算 220 ✓）；tsc 严格通过
- 截图：`docs/shots/p3a_{dusk_open,dusk_closed,night_open}.png`

## P3a 攻坚教训（防复发）
- **headless 截图三连坑**：① `--timeout` 只是兜底——页面 network-idle 约 2.3s 即抢拍，0.6s loading 淡出必撞枪口；② 大面积 compositor 动画（opacity 过渡）在 --disable-gpu 下冻结在中间帧，永久残留 → 加 `?fastload=1`（loading 即隐）+ 900ms 后 display:none 双保险；③ `--virtual-time-budget` 对 rAF 页面间歇不退出，真实时间 `--timeout` + 独立临时 user-data-dir 才稳定
- **1× 缩略图"文字发花" = 亚像素抗锯齿错觉**（5× 放大后"恢复默认"完全清晰）——先放大取证再下结论，不许按错觉改代码
- backdrop-filter 在 headless 可致字形重影 + 移动端合成开销，改实底
- 控件底色透明度要够（0.05 会被身后亮窗 backdrop 透色糊字 → 0.62/0.72）
- 自查 dev server 是否 serve 新代码：用 esbuild 转译后的形态匹配（`display = "none"`），写原样 `display = 'none'` 会假阴性；DOM dump 在 load 事件即拍（早于首帧 reveal），不能用它判断运行时状态
- `?light=`/键盘/三入口必须与面板 chips 同源（startPreset 参数），否则 UI 高亮和场景各说各话
