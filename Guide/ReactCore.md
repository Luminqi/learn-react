# ReactCore
>本章的代码在ReactCore分支中

## 介绍

React Core 提供了 React.Component, React.createElement, React.Fragment 等等API。这里只会简单地实现 React.Component 和 React.createElement，因为我们的简单组件仅仅只需要这两个 API。

### React.Component

提供了 setState 方法。

### React.createElement

我们写下的 JSX 实际上会被 Baebl 转译成调用 React.createElement 的结果。而 React.createElement 的作用就是根据给定的类型创建 ReactElement 对象。

关于 JSX 可以看 [WTF is JSX](https://jasonformat.com/wtf-is-jsx/) 这篇文章。

你也可以在 [babel REPL](https://babeljs.io/repl) 中尝试转译JSX。

## 实现

新建 ReactComponent.js 和 ReactElement.js

### ReactComponent.js

```javascript
export class Component {
  constructor (props) {
    this.props = props
    this.updater = {}
  }
  setState (partialState) {
    this.updater.enqueueSetState(this, partialState)
  }
}
```
注意 updater 会在 adoptClassInstance 中被更新。

### ReactElement.js

```javascript
class ReactElement {
  constructor (type, props) {
    this.type = type
    this.props = props
  }
}

export function createElement(type, config, ...children) {
  const props = {}
  if (config !== null) {
    Object.keys(config).forEach(propName => 
      props[propName] = config[propName])
  }
  if (children.length >= 1) {
    props.children = children.length === 1 ? children[0] : children
  }
  return new ReactElement(type, props)
}
```

createElement 会创建一个具有 type 和 props 属性的对象。type 可能是一个 html 标签名称字符串也可能是一个类。props 包含了 config 中所有的属性，而且可能还有一个额外的 children 属性，保存的是后代。注意文本后代直接用字符串表示。

在 src 下新建文件夹 react， 将这两个文件放入其中，新建 index.js。
```javascript
import { createElement } from './ReactElement'
import { Component } from './ReactComponent'

const React = {
  Component,
  createElement
}

export default React
```

在 App.js 和 index.js 中修改为 import React from './react'，运行项目。可以看到项目正常运行。

[下一章](Suspense.md)