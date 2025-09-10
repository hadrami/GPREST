// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";

import store  from "./redux/store";
import { attachStore } from "./lib/api";
import { bootstrapAuth } from "./redux/slices/authSlice";
import App from "./App";
import "./index.css";

attachStore(store);
store.dispatch(bootstrapAuth());

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
