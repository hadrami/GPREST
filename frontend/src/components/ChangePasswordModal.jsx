// src/components/ChangePasswordModal.jsx
import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { changePassword, clearError, clearPasswordChangeSuccess } from '../redux/slices/authSlice';

const ChangePasswordModal = ({ isOpen, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  
  const dispatch = useDispatch();
  const { user, isLoading, error, passwordChangeSuccess } = useSelector(state => state.auth);
  
  // Reset form when modal is opened/closed
  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setValidationError('');
      dispatch(clearError());
      dispatch(clearPasswordChangeSuccess());
    }
  }, [isOpen, dispatch]);
  
  // Close modal after successful password change
  useEffect(() => {
    if (passwordChangeSuccess) {
      setTimeout(() => {
        onClose();
      }, 2000);
    }
  }, [passwordChangeSuccess, onClose]);
  
  if (!isOpen) return null;
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');
    
    // Client-side validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setValidationError('Tous les champs sont obligatoires');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setValidationError('Les nouveaux mots de passe ne correspondent pas');
      return;
    }
    
    if (newPassword.length < 6) {
      setValidationError('Le nouveau mot de passe doit contenir au moins 6 caractères');
      return;
    }
    
    // Dispatch change password action
    dispatch(changePassword({
      identifier: user.identifier,
      currentPassword,
      newPassword
    }));
  };
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>
        
        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-green-600 sm:mx-0 sm:h-10 sm:w-10">
                <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Changer votre mot de passe
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    {user?.isFirstLogin 
                      ? "C'est votre première connexion. Veuillez changer votre mot de passe temporaire pour un mot de passe sécurisé."
                      : "Veuillez entrer votre mot de passe actuel et votre nouveau mot de passe."}
                  </p>
                </div>
                
                {/* Validation error message */}
                {validationError && (
                  <div className="mt-2 p-2 bg-red-100 text-red-700 text-sm rounded">
                    {validationError}
                  </div>
                )}
                
                {/* API error message */}
                {error && (
                  <div className="mt-2 p-2 bg-red-100 text-red-700 text-sm rounded">
                    {error}
                  </div>
                )}
                
                {/* Success message */}
                {passwordChangeSuccess && (
                  <div className="mt-2 p-2 bg-green-100 text-green-700 text-sm rounded">
                    Mot de passe changé avec succès!
                  </div>
                )}
                
                {/* Form */}
                <form className="mt-4" onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <label htmlFor="current-password" className="block text-sm font-medium text-gray-700">
                      Mot de passe actuel
                    </label>
                    <input
                      type="password"
                      id="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-green-500 focus:border-green-500"
                      required
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">
                      Nouveau mot de passe
                    </label>
                    <input
                      type="password"
                      id="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-green-500 focus:border-green-500"
                      required
                      minLength={6}
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">
                      Confirmer le nouveau mot de passe
                    </label>
                    <input
                      type="password"
                      id="confirm-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-green-500 focus:border-green-500"
                      required
                    />
                  </div>
                  
                  <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                    <button
                      type="submit"
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                      disabled={isLoading}
                    >
                      {isLoading ? 'Chargement...' : 'Changer le mot de passe'}
                    </button>
                    
                    {!user?.isFirstLogin && (
                      <button
                        type="button"
                        className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:mt-0 sm:w-auto sm:text-sm"
                        onClick={onClose}
                        disabled={isLoading}
                      >
                        Annuler
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChangePasswordModal;