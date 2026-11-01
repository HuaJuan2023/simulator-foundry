# 接口与扩展

## 已有代码的真实边界

随附 starter 是当前可运行项目的完整快照。`main.js` 仍通过 cargo / ocean 分支组织 UI，`demo-tour.js` 仍包含货轮专属章节；尚未完成任意场景的自动插件发现。不要对用户宣称“只换一个模型就能生成任意模拟器”。

| 层 | 当前文件 | 新模拟器的处理 |
| --- | --- | --- |
| 应用壳与身份 | main.js、style.css、recording-utils.js | 延续交互风格；把特定控件改为场景参数描述 |
| 播放与镜头 | ocean.js 中的时钟、OrbitControls、camera-composition.js | 保留时钟原则；为新主体设置尺度与镜头约束 |
| 录制与导出 | recorder.js、fixed-frames.js | 复用；新增场景需提供渲染、快照与音频接口 |
| 演示 | demo-tour.js | 替换章节和状态变化，保留结束恢复逻辑 |
| 场景 | ocean.js、cargo-ship.js、celestial.js、wake*.js、ripple-field.js | 仅海洋场景直接复用，其余按模型实现 |

`ocean.js` 混合场景与部分通用逻辑。做第二类场景时，按真实重复内容逐步提取 renderer / clock / input / camera 服务，先保留 cargo 的回归运行入口。不要为了抽象先重写全部已验证效果。

## 引擎适配约定

随附模块实际调用的接口：

```js
const simulator = {
  update(), setPaused(value), resetCamera(), setView(id),
  setSubjectName(name), moveSubject(x, z), orbitCamera(angle, radius, height),
  captureState(), restoreState(snapshot),
  onBeforeFrame(callback), // callback(timeMs)，返回 unsubscribe
  onFrame(callback),       // callback(canvas, timeMs)，必须在 render 后同步触发
  beginExport(width, height),
  renderExportFrame(index, fps),
  endExport(),
  captureStream(fps, width, height), endLiveCapture(),
  recordingAudio(), // Promise<{stream, stop}>；场景无音频可在壳中隐藏选项
  capture(), dispose()
};
```

这不是要求所有新实现拥有船的 XZ 海平面。新场景可提供 `moveSubject(position)`、`setSubjectPose()` 等自然接口，并同步调整演示调用。核心约束是渲染、操纵、恢复和导出行为，而非固定函数签名。

## 时间与渲染

- 实时模式用实际 dt 进行模拟，可限制大步长以维持稳定性。日月时刻、流速、航程不要混为一个值。
- 导出模式暂停实时 RAF，只由 `index / fps` 驱动模拟，每次推进 `1 / fps`。场景渲染后同步复制到导出画布，再交编码器；等待编码完成接收下一帧。
- 录制尺寸锁定期间忽略窗口 resize 对内部缓冲的影响；结束恢复尺寸、pixel ratio、aspect 与 FOV。
- 不保留 `preserveDrawingBuffer` 作为录屏方案；截图可显式渲染再读。实时录屏直接捕获原始 GPU 画布，逐帧导出才合成字幕。
- GPU 模拟缓存可以重置或可重算。快照中明确哪些状态恢复、哪些缓存清空，不能把“画面看起来类似”称为精确物理恢复。

## 参数描述建议

新增场景可使用 `{id,label,unit,min,max,step,default,group}` 生成控制面板，配合 `{id,label,values,view}` 预设与 `{title,values,animate,action}` 演示。这是扩展方向，starter 尚未自动读取这些描述。

不同场景只启用相关能力：

- 轨道：质量、速度、引力、时间倍率、轨道历史；无须海浪开关。
- 机械：驱动速度、约束、负载、部件拖动范围、观察视角；太阳朝向通常无关。
- 地形风场：风向、速度、粒子密度、日照、地形尺度；粒子轨迹依速度场生成。

表现型模型要标注近似边界，不把装饰动画当作经过验证的数值模拟。
