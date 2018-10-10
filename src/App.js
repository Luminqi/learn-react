import React from './react';
import logo from './logo.svg';
import './App.css';
import { createCache, createResource } from './suspense/custom-cache'

// const cache = createCache()
// const sleep = (time, resolvedValue) =>
//   new Promise(resolve => {
//     setTimeout(() => resolve(resolvedValue), time)
//   })
// const myResource = createResource(id => sleep(2000, `${id}-value`))
// class Foo extends React.Component {
//   constructor(props) {
//     super(props)
//   }
//   render () {
//    const value = myResource.read(cache, 'foo')
//    return (
//     <div>{value}</div>
//    )
//   }
// }
// class App extends React.Component {
//   constructor (props) {
//     super(props)
//   } 
//   render () {
//     return (
//     <React.Placeholder fallback={<div>🌀 'Loading....'</div>}>
//       <Foo />
//     </React.Placeholder>
//     )
//   }
// }
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

//   // shouldComponentUpdate () {
//   //   console.log('shouldComponentUpdate')
//   //   if (this.state.counter === 0) {
//   //     this.setState({counter: 1})
//   //   }
//   //   return true
//   // }

//   // componentDidMount () {
//   //   console.log('componentDidMount')
//   //   this.setState({counter:1, value: 'mount'})
//   // }
  

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
//               this.setState({ value: this.state.value + 'a' })
//             }}>
//               +
//             </button>
//           </div>
//         </div>
//       </div>
//     );
//   }
// }

class ColorText extends React.Component {
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

class App extends React.Component {
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

export default App;
