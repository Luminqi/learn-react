# 自定义渲染器
>本章的代码在CustomRender分支中

## 什么是renderer

简单地说 renderer 把我们的代码渲染在特定的环境中。比如 DomRenderer 把代码渲染在浏览器环境中，NativeRenderer 则是渲染在移动环境中。其他还有 ReactNoopRenderer 是 React 内部用来调试 Fiber 的, ReactTestRenderer 可以将 React 组件渲染成纯 JavaScript 对象，甚至都不需要依赖于 DOM 和原生移动环境。

What's More

一个有趣的项目, 把React组件渲染成一个word文档: [Making-a-custom-React-renderer](https://github.com/nitin42/Making-a-custom-React-renderer)

## 怎样写一个自定义的渲染器

上面的项目已经包含了如何写一个渲染器的教程，你可以选择通过阅读它来完成自己的Renderer。但是我的目标是在浏览器环境中调试React， 所以我需要的是一个简单的DomRenderer。我发现上面的教程对我来说仍然不够简单直接。

[Hello World Custom React Renderer](https://medium.com/@agent_hunt/hello-world-custom-react-renderer-9a95b7cd04bc)

这篇文章(需要翻墙)论述了如何写一个非常简单的 DomRenderer。我强烈建议你自己通过文章里的方法构建一个自己的DomRenderer，因为很可能最终得到的结果和我有所不同(我的结果也和文章里的有区别)。

**简单的说一下步骤：**

1. 用 [create-react-app](https://github.com/facebook/create-react-app) 初始化一个项目
2. 在 App.js 写一个简单的组件
```javascript
    import React, { Component } from 'react';
    import logo from './logo.svg';
    import './App.css';

    class App extends Component {
      constructor(props) {
        super(props);
        this.state = {
          counter: 0,
          value: ''
        };
      }

      handleChange = (event) => {
        this.setState({value: event.target.value});
      }

      render() {
        return (
          <div className="App">
            <header className="App-header">
              <img src={logo} className="App-logo" alt="logo" />
              <h1 className="App-title">Welcome to React</h1>
            </header>
            <div className="App-intro">
              <div className="button-container">
                <button
                  className="decrement-button"
                  onClick={() => this.setState({ counter: this.state.counter - 1 })}
                >
                  -
                </button>
                <div className="counter-text">{this.state.counter}</div>
                <button
                  className="increment-button"
                  onClick={() => this.setState({ counter: this.state.counter + 1 })}
                  >
                  +
                </button>
              </div>
            </div>
          </div>
        );
      }
    }

    export default App;
```

3. 安装 react-reconciler (yarn add react-reconciler)

reconciler 模块是实现 fiber 架构的关键，它接受一个 hostConfig 对象， 返回一个 renderer
这样设计的原因是为了复用 reconciler 模块, 这样不同的环境可以定义不同的 hostConfig 对象。

在 [React 官方文档](https://reactjs.org/docs/implementation-notes.html)中也提到了

Renderers use injection to pass the host internal class to the reconciler. For example, React DOM tells the reconciler to use ReactDOMComponent as the host internal instance implementation

4. 在 src 目录下新建 CustomDom.js
```javascript
    import ReactReconciler from 'react-reconciler'

    const hostConfig = {}

    const CustomRenderer = ReactReconciler(hostConfig)

    export const CustomDom = {
      render: (reactElement, container) => {
        let root = container._reactRootContainer
        if (!root) {
          // initial mount
          const isConcurrent = true // concurrent mode
          root = container._reactRootContainer = customRenderer.createContainer(container, isConcurrent)
        }
        customRenderer.updateContainer(reactElement, root)
      }
    }
```
hostConfig 目前只是一个空的对象，我们将会在下面一步一步完善它。
CustomDom 是用来替换 ReacDom 的([ReactDom的源码](https://github.com/facebook/react/blob/master/packages/react-dom/src/client/ReactDOM.js))
注意我们已经做了很多简化工作，我们只保留了 ReactDom 的 render 函数，而且忽略了 render 函数可能传入的第三个 callback 参数。另外注意异步模式默认是不开启的，我们需要令 isConcurrent = true。当我自己实现了 createContainer
函数的时候，我会忽略 isConcurrent 参数， 因为我默认它是 true。

本来异步 React 是叫 Async React，但是现在改为叫 Concurrent React 了， 有兴趣可以看看 dan 在 twitter 上的[讨论](https://twitter.com/dan_abramov/status/1036940380854464512)

通过简化，render函数很容易理解：在第一次调用 CustomDom.render 的时候，即在mount过程中，会调用 createContainer 函数来构造一个 root。 然后将 root 保存到 container 的 _reactRootContainer 属性中。 这样下次再调用 CustomDom.render 的时候就可以使用之前的 root。最后调用 updateContainer 函数渲染组件。

这里已经涉及到了 Element, Root 等概念：
* render 函数的第一个参数 reactElement 是一个 Element 对象，关于其介绍以及和 Component，Instance 的区别可以看 React [官方文档](https://reactjs.org/blog/2015/12/18/react-components-elements-and-instances.html)。
简单的来说它是通过 babel 将 jsx 编译成类似于
```javascript
    {
      type: 'div'
      props: {}
    }
```
这样的对象，具体如何实现请看 ReactCore 章节
* Root 是一个 FiberRoot 类的实例，我将会和 Fiber 一起介绍它
5. 在 index.js 中用我们自定义的 Dom 替换 ReactDom
```javascript
    import React from 'react';
    import { CustomDom } from './CustomDom';
    // import ReactDOM from 'react-dom';
    import './index.css';
    import App from './App';
    import registerServiceWorker from './registerServiceWorker';

    CustomDom.render(<App />, document.getElementById('root'));
    // ReactDOM.render(<App />, document.getElementById('root'));
    registerServiceWorker();
```
