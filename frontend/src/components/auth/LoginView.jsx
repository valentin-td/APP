// frontend/src/components/auth/LoginView.jsx
// Écran de Connexion & Inscription multi-profils (Gérant, Employé, Salon, Mot de passe oublié)

import ThemeToggle from '../common/ThemeToggle';

export default function LoginView({
  isDarkMode,
  onToggleTheme,
  loginType,
  setLoginType,
  isForgotPassword,
  setIsForgotPassword,
  isLoginMode,
  setIsLoginMode,
  emailInput,
  setEmailInput,
  motDePasseInput,
  setMotDePasseInput,
  prenomGerantInput,
  setPrenomGerantInput,
  nomFamilleGerantInput,
  setNomFamilleGerantInput,
  nomSalonInput,
  setNomSalonInput,
  idSalonInput,
  setIdSalonInput,
  nomEmployeInput,
  setNomEmployeInput,
  pinEmployeInput,
  setPinEmployeInput,
  pinSalonInput,
  setPinSalonInput,
  erreurLogin,
  setErreurLogin,
  msgSucces,
  onLogin,
  onRegister,
  onForgotPassword
}) {
  return (
    <div className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '90vh', position: 'relative' }}>
      <div className="carte" style={{ width: '100%', maxWidth: '380px', textAlign: 'center', padding: '32px', position: 'relative' }}>
        
        {/* Bouton ThemeToggle placé en haut à droite de la carte */}
        <ThemeToggle isFixed={true} isDarkMode={isDarkMode} onToggle={onToggleTheme} />

        <div className="logo-container" style={{ marginBottom: '24px' }}>
          <img src={isDarkMode ? "/IMG_6805.png" : "/IMG_6804.png"} alt="STACK Logo" className="app-logo" />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
          <button 
            type="button"
            onClick={() => { setLoginType('gerant'); setErreurLogin(null); setIsForgotPassword(false); }} 
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontWeight: 'bold', background: loginType === 'gerant' ? 'var(--text-main)' : 'var(--bg-app)', color: loginType === 'gerant' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s ease', fontSize: '13px' }}
          >
            Gérant
          </button>
          <button 
            type="button"
            onClick={() => { setLoginType('employe'); setErreurLogin(null); setIsForgotPassword(false); }} 
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontWeight: 'bold', background: loginType === 'employe' ? 'var(--text-main)' : 'var(--bg-app)', color: loginType === 'employe' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s ease', fontSize: '13px' }}
          >
            Employé
          </button>
          <button 
            type="button"
            onClick={() => { setLoginType('salon'); setErreurLogin(null); setIsForgotPassword(false); }} 
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontWeight: 'bold', background: loginType === 'salon' ? 'var(--text-main)' : 'var(--bg-app)', color: loginType === 'salon' ? 'var(--bg-card)' : 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s ease', fontSize: '13px' }}
          >
            Salon
          </button>
        </div>
        
        {isForgotPassword ? (
          <>
            <h2 style={{ color: 'var(--text-main)' }}>Mot de passe oublié</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>Saisissez votre email pour réinitialiser l'accès.</p>
            {msgSucces && <div style={{ backgroundColor: 'var(--bg-success)', color: 'var(--color-success)', padding: '12px', borderRadius: 'var(--radius-input)', fontSize: '13px', marginBottom: '16px', fontWeight: '500' }}>{msgSucces}</div>}
            <input type="email" className="input-fournisseur" placeholder="Adresse e-mail" style={{ marginBottom: '12px' }} value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
            <button type="button" className="btn-action" onClick={onForgotPassword} style={{ width: '100%', marginTop: '8px' }}>Recevoir le lien</button>
            <p style={{ fontSize: '13px', color: 'var(--text-main)', marginTop: '24px', cursor: 'pointer', fontWeight: '500' }} onClick={() => setIsForgotPassword(false)}>Retour à la connexion</p>
          </>
        ) : (
          <>
            {erreurLogin && (<div style={{ backgroundColor: 'var(--bg-danger)', color: 'var(--color-danger)', padding: '12px', borderRadius: 'var(--radius-input)', fontSize: '13px', marginBottom: '16px', fontWeight: '500' }}>{erreurLogin}</div>)}
            {loginType === 'gerant' ? (
              <>
                {!isLoginMode && (
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                    <input type="text" className="input-fournisseur" placeholder="Prénom (Gérant)" style={{ flex: 1 }} value={prenomGerantInput} onChange={(e) => setPrenomGerantInput(e.target.value)} />
                    <input type="text" className="input-fournisseur" placeholder="Nom de famille" style={{ flex: 1 }} value={nomFamilleGerantInput} onChange={(e) => setNomFamilleGerantInput(e.target.value)} />
                  </div>
                )}
                {!isLoginMode && (<input type="text" className="input-fournisseur" placeholder="Nom de votre salon" style={{ marginBottom: '12px' }} value={nomSalonInput} onChange={(e) => setNomSalonInput(e.target.value)} />)}
                <input type="email" className="input-fournisseur" placeholder="Adresse e-mail" style={{ marginBottom: '12px' }} value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
                <input type="password" className="input-fournisseur" placeholder="Mot de passe" value={motDePasseInput} onChange={(e) => setMotDePasseInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (isLoginMode ? onLogin() : onRegister())} />
                <button type="button" className="btn-action" onClick={isLoginMode ? onLogin : onRegister} style={{ width: '100%', marginTop: '16px' }}>{isLoginMode ? 'Se connecter' : "S'inscrire"}</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer', margin: 0, fontWeight: '600' }} onClick={() => { setIsLoginMode(!isLoginMode); setErreurLogin(null); }}>{isLoginMode ? "Créer un compte" : "Se connecter"}</p>
                  {isLoginMode && <p style={{ fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', margin: 0 }} onClick={() => setIsForgotPassword(true)}>Oublié ?</p>}
                </div>
              </>
            ) : loginType === 'employe' ? (
              <>
                <input type="text" className="input-fournisseur" placeholder="ID du Salon (ex: 1)" style={{ marginBottom: '12px' }} value={idSalonInput} onChange={(e) => setIdSalonInput(e.target.value)} />
                <input type="text" className="input-fournisseur" placeholder="Votre prénom" style={{ marginBottom: '12px' }} value={nomEmployeInput} onChange={(e) => setNomEmployeInput(e.target.value)} />
                <input type="password" maxLength="4" className="input-fournisseur" placeholder="Code PIN à 4 chiffres" value={pinEmployeInput} onChange={(e) => setPinEmployeInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onLogin()} />
                <button type="button" className="btn-action" onClick={onLogin} style={{ width: '100%', marginTop: '16px' }}>Accéder au Planning</button>
              </>
            ) : (
              <>
                <input type="text" className="input-fournisseur" placeholder="ID du Salon (ex: 1)" style={{ marginBottom: '12px' }} value={idSalonInput} onChange={(e) => setIdSalonInput(e.target.value)} />
                <input type="password" maxLength="10" inputMode="numeric" className="input-fournisseur" placeholder="Code PIN du salon" value={pinSalonInput} onChange={(e) => setPinSalonInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onLogin()} />
                <button type="button" className="btn-action" onClick={onLogin} style={{ width: '100%', marginTop: '16px' }}>Accéder au Salon</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
