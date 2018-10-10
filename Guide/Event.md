# 事件处理
>本章的代码在Event分支中
## 学习资料
[How exactly does React handles events](https://levelup.gitconnected.com/how-exactly-does-react-handles-events-71e8b5e359f2)

关于 React 的事件处理系统的整体介绍

[Interactive updates](https://github.com/facebook/react/pull/12100)

React 对事件的三种划分：

* Controlled events：更新会被同步地执行。
* Interactive events：比普通的异步更新优先级高，其实就是对应用 computeInteractiveExpiration 计算更新任务到期时间。
* Non-interactive events：低优先级的异步更新，对应用 computeAsyncExpiration 计算更新任务到期时间。

[Does React keep the order for state updates](https://stackoverflow.com/questions/48563650/does-react-keep-the-order-for-state-updates#)

所有发生在 React event handler 中的更新会被批量处理。即当在一个 React event handler 中，不管调用多少 this.setState，只会导致重新渲染一次。

这就是为什么需要 isBatchingUpdates 和 isBatchingInteractiveUpdates 变量。

## 调试

修改一下App.js
```javascript
class ColorText extends Component {
  constructor(props) {
    super(props)
    this.state = {
      colorIndex: 0
    }
  }
  render () {
    const colorPanel = ['red', 'blue']
    return (
      <div
        className="color-flip"
        style={{color: colorPanel[this.state.colorIndex]}}
        onClick={() => this.setState({ colorIndex: (this.state.colorIndex + 1) % colorPanel.length })}
      >
        {this.props.children}
      </div>
    )
  }
}

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      counter: 0,
      value: ''
    };
    this.handleChange = this.handleChange.bind(this)
  }

  handleChange (event) {
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
          <input type="text" value={this.state.value} onChange={this.handleChange} />
          <ColorText>      
            <div className="button-container">
              <button className="decrement-button" onClick={() => {
                this.setState({ counter: this.state.counter - 1 })
              }}>
                -
              </button>
              <div className="counter-text">{this.state.counter}</div>
              <button className="increment-button" onClick={() => {
                this.setState({ counter: this.state.counter + 1 })
              }}>
                +
              </button>
            </div>
          </ColorText>
        </div>
      </div>
    );
  }
}
```

加入了一个新组件 ColorText，触发点击事件之后改变文本颜色。由于 ColorText 的更新发生在 div 元素的 style 属性上，且加入的 input 元素，它的更新发生在其 value 属性上，所以这违反了之前所作的假设：只有文本节点发生改变。所以需要完善 finalizeInitialChildren，prepareUpdate 和 commitUpdate 函数的逻辑。

```javascript
hostConfig = {
  finalizeInitialChildren: (domElement, props) => {
    Object.keys(props).forEach(propKey => {
      const propValue = props[propKey]
      if (propKey === 'children') {
        if (typeof propValue === 'string' || typeof propValue === 'number') {
          domElement.textContent = propValue
        }
      } else if (propKey === 'style') {
        // 设置初始 style
        const style = domElement.style
        Object.keys(propValue).forEach(styleName => {
          let styleValue = propValue[styleName]
          style.setProperty(styleName, styleValue)
        })
      } else if (propKey === 'className') {
        domElement.setAttribute('class', propValue)
      } else if (propKey === 'onClick') {
        domElement.addEventListener('click', propValue)
      } else {
        const propValue = props[propKey]
        domElement.setAttribute(propKey, propValue)
      }
    })
  },
  prepareUpdate: (oldProps, newProps) => {
    let updatePayload = null
    let styleUpdates = null
    Object.keys(newProps).forEach(propKey => {
      let nextProp = newProps[propKey]
      let lastProp = oldProps[propKey]
      if (nextProp !== lastProp && (typeof nextProp === 'string' || typeof nextProp === 'number')) {
        (updatePayload = updatePayload || []).push(propKey, '' + nextProp)
      }
      if (propKey === 'style') {
        for (let styleName in nextProp) {
          if (nextProp.hasOwnProperty(styleName) && lastProp[styleName] !== nextProp[styleName]) {
            // 新的 style 对象有和之前不同的属性值
            styleUpdates = nextProp
            break
          }
        }
        if (styleUpdates) {
          (updatePayload = updatePayload || []).push(propKey, styleUpdates)
        }
      }
    })
    return updatePayload
  },
  commitUpdate: (domElement, updatePayload) => {
    for (let i = 0; i < updatePayload.length; i += 2) {
      let propKey = updatePayload[i]
      let propValue = updatePayload[i + 1]
      if (propKey === 'children') {
        // 更新后代
        domElement.textContent = propValue
      } else if (propKey === 'style'){
        // 更新样式
        const style = domElement.style
        Object.keys(propValue).forEach(styleName => {
          let styleValue = propValue[styleName]
          style.setProperty(styleName, styleValue)
        })
      } else {
        // 更新属性
        domElement[propKey] = propValue
      }
    }
  }
}
```

在必要的函数添加 console.log，运行项目。

![wrong](event_wrong.PNG)

如果点击 - 或 + 按钮，本应该调用 computeInteractiveExpiration，实际上却调用了 computeAsyncExpiration。而且会触发两次 scheduleCallbackWithExpirationTime，一次是 button 上绑定的回调函数被触发调用this.setState。另一次是由于事件冒泡，导致 ColorText 组件中的 div 上绑定的回调函数被触发调用 this.setState。这不是正确的行为，两次更新都 schedule 了更新。正确的行为应该是两次更新触发一次 scheduleCallbackWithExpirationTime。

## 实现

事件处理的实现完全基于我个人的理解，它只考虑了很少的情况，可能完全是错误的。实际上 React 准备 [Drastically simplify the event system](https://github.com/facebook/react/issues/13525)。

首先需要区分 Controlled events， Interactive events 和 Non-interactive events。React 源码 [SimpleEventPlugin.js](https://github.com/facebook/react/blob/master/packages/react-dom/src/events/SimpleEventPlugin.js) 中有 Interactive events 和 Non-interactive events 的完整列举。比如说 click，focus 属于 Interactive events，而 mouseMove 和 drag 属于 Non-interactive events。

那么什么是 Controlled events？

受控组件中，像<input>,<textarea>, 和 <select>这类表单元素的 change 事件是一个 Controlled event。

