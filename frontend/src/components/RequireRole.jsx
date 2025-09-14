// frontend/src/components/routing/RequireRole.jsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectUser } from '../redux/slices/authSlice';

export default function RequireRole({ roles = [] }) {
  const user = useSelector(selectUser);
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  // Allow if matches any role
  if (roles.includes(user.role)) return <Outlet />;

  // If user is NOT allowed, push them to /scan if they’re authenticated but not admin
  return <Navigate to="/scan" replace />;
}
