# 自定义渲染器

## 什么是renderer

简单地说 renderer 把我们的代码渲染在特定的环境中。比如 DomRenderer 把代码渲染在浏览器环境中，NativeRenderer 则是渲染在移动环境中。其他还有 ReactNoopRenderer 是 React 内部用来调试 Fiber 的, ReactTestRenderer 可以将 React 组件渲染成纯 JavaScript 对象，甚至都不需要依赖于 DOM 和原生移动环境。

What's More

一个有趣的项目, 把React组件渲染成一个word文档: [Making-a-custom-React-renderer](https://github.com/nitin42/Making-a-custom-React-renderer)

## 怎样写一个自定义的渲染器

上面的项目已经包含了如何写一个渲染器的教程，你可以选择通过阅读它来完成自己的Renderer。但是我的目标是在浏览器环境中调试React， 所以我需要的是一个简单的DomRenderer。我发现上面的教程对我来说仍然不够简单直接。

[Hello World Custom React Renderer](https://medium.com/@agent_hunt/hello-world-custom-react-renderer-9a95b7cd04bc)

这篇文章（需要翻墙）论述了如何写一个非常简单的 DomRenderer。我强烈建议你自己通过文章里的方法构建一个自己的DomRenderer，因为很可能最终得到的结果和我有所不同（我的结果也和文章里的有区别）。

**简单的说一下步骤：**
l. 用 [create-react-app](https://github.com/facebook/create-react-app) 初始化一个项目
l. 在 App.js 写一个简单的组件

