# Suspense
>本章的代码在Suspense分支中

## 学习资料

[fresh-async-react](https://github.com/sw-yx/fresh-async-react)

有很多 Suspense 部分的资料。

[kentcdodds/react-suspense-simple-example ](https://www.youtube.com/watch?v=7LmrS2sdMlo&feature=youtu.be&a=)

如何写一个简单的 suspense cache。

注意 [React 16.6 canary release](https://github.com/facebook/react/pull/13799) 中激活了 Suspense。而且将 Placeholder 重新命名为 Suspense。

## 原理

[@acdlite on how Suspense works](https://twitter.com/acdlite/status/969171217356746752)

* 在 render 函数中，从缓存中读取数据。
* 如果数据已经被缓存，继续正常的渲染。
* 如果数据没有被缓存，意味着可能需要向服务器发起请求，这时候就会抛出一个 promise。React 会捕获这个 promise 且暂停渲染。
*  当这个 promise resolves，React 会重新开始渲染。 

## 演示

```javascript
import React, { unstable_Suspense as Suspense } from 'react'
import { cache } from './cache'
import { createResource } from 'react-cache'

const sleep = (time, resolvedValue) =>
  new Promise(resolve => {
    setTimeout(() => resolve(resolvedValue), time)
  })
const myResource = createResource(id => sleep(3000, id))

class Foo extends React.Component {
  render () {
    const value = myResource.read(cache, 'foo')
    return (
     <div>{value}</div>
    )
  }
}
class App extends React.Component {
  render () {
    return (
    <Suspense maxDuration={1000} fallback={'Loading....'}>
      <Foo />
    </Suspense>
    )
  }
}

export default App
```
Suspense 组件会捕获其下的子组件抛出的 promise， 然后决定渲染什么。 当 promise 还没有 resolves 时，将渲染 fallback，当 promise resolves 时，再渲染 Foo 组件。maxDuration 表示等待多长的时间再渲染 fallback，因为如果数据获取足够迅速，并没有必要渲染 fallback。

![suspense](Images/suspense.gif)

可以看到点击刷新，等待 1 秒之后渲染 fallback，再等待 2 秒之后渲染 Foo 组件。

## 实现

实现 Suspense 将分为两个部分，第一个部分实现 suspense cache，第二个部分完善 fiber 架构来支持 suspense。

### suspense cache




