import "@douyinfe/semi-ui/react19-adapter";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Semi Design 的组件样式由各组件 ES 模块自带并按需注入
// （semi.min.css 未包含在该包的 exports 字段中，手动引入会导致 Vite 构建失败）。
// react19-adapter 必须先于任何 Semi 组件导入：React 19 移除了 ReactDOM.render，
// Semi 的命令式 API（Toast 等）依赖注入的 createRoot 渲染。

import App from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root was not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
