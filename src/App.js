import React from './react'
import logo from './logo.svg'
import './App.css'

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
  
  shouldComponentUpdate (nextProps, nextState) {
    if (this.state.counter === 1) {
      return false
    }
    return true
  }

  componentDidMount () {
    this.setState({counter: 1})
  }

  componentDidUpdate (prevProps, prevState, snapshot) {
    if (this.state.counter === 3) {
      this.setState({counter: 0})
    }
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

export default App
