// frontend/src/redux/store.js
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice.js";
import studentsReducer from "./slices/studentsSlice";
import ticketsReducer from "./slices/ticketSlice";


const store = configureStore({

  reducer: {
  auth: authReducer,
  students: studentsReducer,
  tickets: ticketsReducer,
}
});

export default store; // <-- default export
