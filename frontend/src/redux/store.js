// frontend/src/redux/store.js
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice.js";
import studentsReducer from "./slices/studentsSlice.js";

const store = configureStore({
  reducer: {
    auth: authReducer,
    students: studentsReducer,
  },
});

export default store; // <-- default export
