import { createElement } from './ReactElement'
import { Component } from './ReactComponent'

const React = {
  Component,
  createElement,
  Suspense: Symbol.for('react.suspense')
}

export default React