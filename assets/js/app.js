import React from "react"
import ReactDOM from "react-dom"
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MapScreen from "./pages/MapScreen"

class App extends React.Component {
  render() {
    return (
      <MapScreen />
    )
  }
}

ReactDOM.render(
  <BrowserRouter>
    <Routes>
      {/* Hex deep-links keep a named route so useParams() yields :hexId. */}
      <Route path="/uplinks/hex/:hexId" element={<App />} />
      {/* Everything else mounts the same screen: "/" and project deep-links
          like /gulf-of-nicoya/show-gateways, whose path Map.js decodes with
          utils/projectLink.js. A catch-all is what lets an arbitrary
          project-slug segment work without enumerating projects here. */}
      <Route path="*" element={<App />} />
    </Routes>
  </BrowserRouter>,
  document.getElementById("react-app")
)
