import React from './react';
import { createCache, createResource } from './cache/ReactCache'

const cache = createCache()
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
    <React.Suspense fallback={<div>Loading....</div>}>
      <Foo />
    </React.Suspense>
    )
  }
}

export default App
