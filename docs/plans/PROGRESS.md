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

## Phase 3b 完成（炊烟 + 萤火虫）
- `src/world/smoke.ts`（新，~150 行）：烟囱炊烟 96 粒全 GPU 循环粒子
  - vertex 用 fract(uTime/9s + aOff) 算命期；运动 = 升腾 2.4~3.3m(减速) + 西风漂移越林梢 + 命期正弦摆；LCG(7757) 确定性撒点
  - 面板「炊烟」滑杆（×0~3）已接线：≤1 乘 alpha（0=无烟），>1 压缩淡出窗抬上限
  - 色随太阳高度角（夜暗昼亮灰），FogExp2 片元手动衰减；loop 关键点：frustumCulled=false（真身在 shader 生成）
- `src/world/fireflies.ts`（新，~150 行）：草甸萤火虫 96 粒单 draw call
  - 屋前环带 r 3.5~16m 贴地形撒点 +0.35~1.5m；trim 走=三频 Lissajous；闪烁=sin^4.5 尖脉冲+0.35 底值（抽样点亮）
  - 门控：el 16°→6° 淡入（黎明 el=28 → 归零不可见）；夜随 el 再抬辉度；additive+depthWrite off，深度测试保留（屋体/树干可遮挡）
  - reduced-motion → 游走幅度 ×0.35、炊烟流速 ×0.4
- main.ts 接线 +2 调用；⽰数字：**draw calls 286**（+2，预算问题留给 3d 瘦身）、tris 不变 81,523、构建 gzip **153.35 KB** / 220 ✓
- 截图：`p3b_smoke_dusk.png`（软白烟柱）、`p3b_fireflies_night.png`（夜景绿光点）、`p3b_dawn_gone.png`（黎明萤火虫归零证据）
- console 检查已跑（--enable-logging=stderr）：修复后零 shader 错误

## P3b 攻坚教训（防复发）
- **mat4×vec4=vec4**：`vec3 mv = modelViewMatrix * vec4(p,1.0)` 维度不符 → vertex 编译失败表现为"对象整体不可见"，console 一次性给全 ERROR 行；捕获链 = Edge `--enable-logging=stderr --v=0` + Select-String 'Shader Error|ERROR: 0:'
- **THREE.Color.setRGB 填的是线性空间**：0.70 线性 ≈ sRGB 0.85 近白（烟变成白色气泡串的直接原因）；手动 authored 颜色必须按线性：sRGB 0.6 → 线性 0.32
- **gl_PointSize 实测换算**：px = worldSize × dpr × 46 / vZ；1600 截图再 ÷dpr÷1.75 缩半；"看不清"先算一下该有的 px 再怀疑材质
- 点精灵聚形态：粒子要连成柱必须相邻弹道收敛（seed 方差收紧）+ 尺寸放大叠出软面；alpha 降软（0.36 起）比升亮更"像烟"
- **bench 数字必须 --virtual-time-budget**：--dump-dom 在 load 事件即拍（此时 bench 标签还没写，60 帧后），virtual-time 快进 rAF 后 dump 才有 `__forest_bench`；实拍截图继续用 --timeout（bench 与 shot=1 互斥：shot=1 不写 bench 标签）
- reduced-motion 检查表新增：萤火虫游走幅度、炊烟流速（摄像机漂移/雾片此前已接）

## Phase 3c 完成（树精修：轮生枝 + 针叶卡片，替换圆锥树）
- `trees.ts` 全面重写（170 → ~350 行），需求书"禁绿色圆锥"兑现：
  - **树形**：锥形主干（开口圆柱 6 棱）+ 4~5 层轮生枝（每层 6 枝 3 棱下倾圆柱）+ 枝身 3 处（t=0.25/0.45/0.68）交叉针叶卡 + 梢端卡 + 顶梢竖卡 5 张，云杉塔形/松形散展两个变体（55/45 分配，同材质）
  - **针叶纹理**：canvas 生成 128² 灰度针簇（54 条随机针刺，线条 215-255 级）；绿色全部由顶点色（下暗上亮）× 实例色（tm 涨落）供给——灰度纹理让换色零成本；左下 10px 全白补丁供树干 UV 钉点（pinUVs），一套材质通吃树皮与针叶
  - **阴影剪影**：customDepthMaterial（同 map + alphaTest 0.45 + DoubleSide），否则卡片投实心方块
  - alphaTest 0.45（transparent=false 避免排序）；6 棱/3 棱开口圆柱省顶点；单实例树 ~600 三角形，250 棵 ~26 万
- 调参迭代（3 轮截图）：初版冠稀疏"长腿"（裸枝可见）→ 卡片加密加大 ×1.15；前景松"车轮辐条"（背光裸杆成粗辐条）→ 加 t=0.25 卡位 + 梢端卡 0.75→0.95 + 枝半径 0.038→0.028 + 松垂角 0.46→0.58 + 轮生角抖动 ±0.2→±0.7
- 炊烟远景断珠回归修复（3b 遗留，全景机位暴露）：96→176 粒 + 横漂 3.2→2.55 + 摆幅 ×0.75 + 尺寸 46→50 + 升腾方差 0.9→0.4（收率差防断珠）
- **数字**：draw calls **288**（286+1 变体网格）、tris **318,203**（需求书高 ≤1.0M ✓）、gzip **154.33 KB** ✓（tsc 通过、console 零错误）
- 截图：`p3c_overview4.png`（黄昏全景）、`p3c_frontlit4.png`（顺光针叶林带）、`p3c_night.png`（夜景剪影无回归）
- 已知限制：相机贴进树冠 1~2m 内时卡片轮廓显大/背光成黑辐条（非玩家典型视角，记录待 3d 一并调性地）；近屋 r16 树冠会探过屋檐线（树位合法，视觉上读作"屋顶长草"一处，可接受）

## P3c 攻坚教训（防复发）
- **灰度纹理×顶点色是零成本换色的万能解**：canvas 纹理只画明度（白-gray 针刺），色相留给 vertex/instance tint——同一 128² 纹理服务 250 棵树的色彩变化
- **卡片式近景"轮辐感"**：长枝 + 沿枝卡位太少 → 背光裸枝成粗辐条；收枝半径（0.038→0.028）+ 加密卡位（3 处/枝）+ 加抖动（±0.7rad）三件套解
- **粒子"断珠"复诊**：同一命期邻居若速率方差大（rise 2.4~3.3m），屏幕间距拉开即断珠；收速率方差（差 ≤0.4m）比加密粒子更有效
- `mergeGeometries` 要求所有部件同套 attribute（position/normal/uv/color）——PlaneGeometry 自带 uv，CylinderGeometry 钉 UV 后再合并，缺色用 vertColors() 补

## Phase 3d 完成（提亮 + 补光 + 绘制瘦身）
- **瘦身（核心）**：
  - `cabin.ts`：静态件全部改为"几何烘进世界矩阵 → 按材质合并"（part/partM 批管线），cabin 从 ~125 个独立 mesh → **8 个合并批**（log / plank / 山墙双面 plank / darkWood / stone / chimney / door / glass）；窗 5 组共 40 件并入 darkWood+glass 两批；山墙三角原本无 uv，补零 uv 满足 mergeGeometries 全套 attribute；玻璃批不投影（与原行为一致）
  - `terrain.ts` makeRocks：12 块岩石各自抖动几何烘矩阵后**合成 1 个 mesh**（确定性 rnd 调用序列保持原序，布点/碰撞体不变）
  - bench（?bench=1&q=high）：**draw calls 288 → 46**（后期链 ~10、阴影 pass ~14；需求书高档 ≤130 大幅达标）；tris 318,203 → 320,445（合并后整批投影/整体剔除导致 +2.2k，余量充足）
- **提亮 + 补光**（dawn 列、夜锚点不动，只抬黄昏/蓝调两段；pair 前值为暮后值为晨）：
  - el:0：sunI 暮 1.7→2.05 · fillI 0.50→0.95 · exp 1.28→1.42
  - el:-8：sunI 0.50→0.75 · hemiI 0.62→0.78 · fillI 0.55→0.90 · exp 1.06→1.16
  - el:-18：sunI 0.20→0.28 · hemiI 0.44→0.52 · fillI 0.50→0.60 · exp 0.99→1.04
  - 实测黄昏屏幕平均照度 54.1→58.6（ACES 压缩后的等效 +8%；蓝调下原木墙已清晰可读）
- 数字：tsc 严格通过；console 干净（含 shader 编译复核）；构建 gzip **154.35 KB**（预算 220 ✓）
- 截图：`docs/shots/p3d_{dusk,dusk_back,dusk_front,blue,night}.png`（黄昏默认景与 3c 同机位逐帧一致——合并零视觉回归）
- 说明：窗框在低角度太阳下的长投影黑条为 3c 已接受基线的物理投影，本期未引入也未放大

## P3d 攻坚教训（防复发）
- **合并批改动的降噪验收法**：同一机位对着上一阶段验收截图逐帧比对，火萤/炊烟/杂斑全部一致才能下"无回归"结论——本例暗纹与 3c 基线逐像素一致，排除合并引入
- **烘矩阵合并的确定性保序**：随机布点几何烘进矩阵时，rnd() 调用顺序必须与原 mesh 版本逐行对应（scale 的内联 rnd 也算），否则整片布点漂移
- **共享几何进合并批必须 clone 后再烘矩阵**（山墙三角两份坐标不同），一次性 attribute 补齐（uv）要在声明处补，不能靠下游兜底
- luma 抽样脚本（System.Drawing 每 8px 抽样加权灰度）可量化前后照度差，比目测可靠

## Phase 4a 完成（屋内陈设）
- `src/world/interior.ts`（新，~250 行）：全部建于 cabin 本地坐标系（挂在 cabin.group 下随小屋旋转/落位），静态件按材质合并批（同 cabin 批管线），动态件（烛焰/炭床）单独持有引用逐帧闪烁
- **陈设清单**：东北角床（床腿/床尾板/床头板/床垫/枕/红毯）· +Z 墙窗下长桌（烛台+蜡身+空罐）· 矮凳+布垫 · -X 山墙内壁炭炉（背板/侧颊/炉前石板/炭床 emissive/烧柴×2）· 柴堆（+Z 墙角）· 陶罐 · 门旁木箱+挡带 · 桌下地毯 · 床头壁架+书×6（三种书色）
- **室内灯**：烛光 PointLight（暖光 3.4 射程）+ 炭床 PointLight（1.5 射程防穿墙漏光）；闪烁用叠加正弦伪噪声（flick 9.1/17.3/29.7Hz），强度随光仿 cabin 窗光的 glowK=(6-el)/12 夜渐强；烛光挂"炉火"面板倍率
- **陈设碰撞体**：床/桌/凳/木箱/炭炉 5 个 box（世界坐标，随小屋旋转——复用 cabin wallBox 做法），为 5b 进出屋相机防穿
- 数字：tsc 严格通过；console 干净；bench **draw calls 61**（46+15，预算 ≤130 ✓）、tris 321,371（+926）；构建 gzip **155.96 KB**（+1.6KB，预算 220 ✓）
- 截图：`docs/shots/p4a_{hearth_dusk,hearth_night,table_night,bed_dusk}.png`（屋内定点取景：炭炉/烛光夜景、床特写、黄昏火箱）

## P4a 攻坚教训（防复发）
- **屋内截图机位先用"本地坐标→世界坐标"换算避免撞家具**：桌面(0.95,0.4)/床沿都是隐形杀手；第一次机位贴桌腿截出黑柱，换到走廊带（z≈-1.3 与 z+0.09）才构图成立
- ** furnishing 一律不合并进 cabin 合并批**：烛焰/炭床要逐帧改 emissive/scale，静态批的材质是共享的（改=全局闪）；动态件单独 mesh
- collision box 的 y 范围给足（凳 hy 0.45），否则相机推拉会穿凳面

## Phase 4b 要做（进出屋模式）
- `?inside=1`：相机进屋（OrbitRig indoor 分支：小距离环绕/第一人称？），门窗处理——窗玻璃从屋内侧变透明（穿窗看林景+萤火），门外观不变
- 门开动画（门板 mesh 已并入 doorMat 批——需拆出单件或门臼转轴方案）、进出屋过渡（相机穿门/淡切）
- 屋内陈设照明补强：白天从窗透光（透明窗让 hemi/sun 进来？）
