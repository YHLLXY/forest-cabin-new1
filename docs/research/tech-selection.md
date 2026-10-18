# Phase 0+1 · 选型与结论记录

## 选型：Three.js r182
- 许可：three MIT、官方 addons MIT，无传染性，商用合规
- 官方 addons 覆盖本项目需求：EffectComposer、UnrealBloomPass、OutputPass 等均在 three 核心仓内，不需要其他框架
- 对比：Babylon.js 可行但体积偏大；PlayCanvas 生态绑定云服务，不适合纯本地
- 自研相机（不用 OrbitControls）：需要室内/室外模式切换、地形贴地行走网格、以及和碰撞体联动的边界，OrbitControls 开箱能力不够
- 约束兑现：无网络字体、图片程序化 canvas 生成、音频 Web Audio 合成（Phase 5）
- 天穹/远山/云/星全部走 ShaderMaterial 分形噪声，不依赖外部 skybox/HDR

## 实现要点
- 太阳/月亮的 el→az 换算严格按需求书公式，不自造规则
- 星星在天穹 shader 内用 hash(d*260) 方格抖动（约 0.35% 接纳率），避免大网格开销
- 相机 breathing 漂移在 reduced-motion / shot 模式 / 拖拽中自动关闭
- ?shot / ?bench 模式下 loading 遮罩立即隐藏，保证截图确定性

## 踩坑记录（重要）
- canvas 纹理必须设 `tex.colorSpace = SRGBColorSpace`，否则按 linear 解读、整体偏暗约 4 倍
- ShaderMaterial uniforms 数组（vec3[] 等）必须原地 mutate（copy 进去），不能替换实例
- sky.ts 星星块曾因编辑残留多余 `}` 导致 GLSL 编译失败——症状是天空整体渲染异常而非报错抛出；以后每次改 shader 必须用 Edge `--enable-logging=stderr` grep "Shader Error" 复核
- 排查 runtime 错误用 `vite build --minify false` 后读 bundle 定位
- 严禁用 PowerShell Set-Content 批量替换 src 源文件（UTF8 mojibake 会毁文件），只用编辑工具

## 阶段结束时的已知问题（进入 Phase 2 前可接受）
- 地平线雾带（FogPatches 群像连续亮带）→ Phase 2 树林会遮中景，Phase 3 光影面板再统一调
- 月亮偶被云带遮挡；山脊曲线偏平滑
- 真实 GPU 帧耗时/三角形数复测在 Phase 6 做（无头虚拟时间下数值无效）

## 如何接续上下文
- 读 docs/plans/PROGRESS.md → 从 src/main.ts boot() 下溯
- URL 参数：?t(0-86400 秒钟点)/?q(画质档)/?shot(截屏确定性)/?bench(性能采样)/?yaw/?dist(镜头)/?inside/?cam(定点)/?light(预设 dusk|blue|night|dawn)，见 src/core/params.ts
