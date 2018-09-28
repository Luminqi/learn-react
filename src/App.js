import React from './react';
import logo from './logo.svg';
import './App.css';
import { createCache, createResource } from './suspense/custom-cache'

const cache = createCache()
const sleep = (time, resolvedValue) =>
  new Promise(resolve => {
    setTimeout(() => resolve(resolvedValue), time)
  })
const myResource = createResource(id => sleep(2000, `${id}-value`))
class Foo extends React.Component {
  constructor(props) {
    super(props)
  }
  render () {
   const value = myResource.read(cache, 'foo')
   return (
    <div>{value}</div>
   )
  }
}
class App extends React.Component {
  constructor (props) {
    super(props)
  } 
  render () {
    return (
    <React.Placeholder fallback={<div>🌀 'Loading....'</div>}>
      <Foo />
    </React.Placeholder>
    )
  }
}
// class App extends React.Component {
//   constructor(props) {
//     super(props);
//     this.state = {
//       counter: 0,
//       value: ''
//     };
//     this.handleChange = this.handleChange.bind(this)
//   }

//   handleChange (event) {
//     this.setState({value: event.target.value});
//   }

//   render() {
//     return (
//       <div className="App">
//         <header className="App-header">
//           <img src={logo} className="App-logo" alt="logo" />
//           <h1 className="App-title">Welcome to React</h1>
//         </header>
//         <div className="App-intro">
//           <input type="text" value={this.state.value} onChange={this.handleChange} />
//           <div className="button-container">
//             <button className="decrement-button" onClick={() => this.setState({ counter: this.state.counter - 1 })}>
//               -
//             </button>
//             <div className="counter-text">{this.state.counter}</div>
//             <button className="increment-button" onClick={() => {
//               this.setState({ counter: this.state.counter + 1 })
//               this.setState({ counter: this.state.counter + 1 })
//             }}>
//               +
//             </button>
//           </div>
//         </div>
//       </div>
//     );
//   }
// }

export default App;
