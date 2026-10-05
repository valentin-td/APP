import React, { useState } from 'react';

export default function PricingModal({ onClose, isSoftLock, isHardLock, joursRestants, token, onSubscribe }) {
    const [isAnnuel, setIsAnnuel] = useState(false);

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box' }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: '24px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border-color)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                
                {/* Header */}
                <div style={{ padding: '32px 32px 16px 32px', textAlign: 'center' }}>
                    {!isSoftLock && !isHardLock && (
                        <button onClick={onClose} style={{ position: 'absolute', top: '24px', right: '24px', background: 'var(--bg-app)', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold' }}>✕</button>
                    )}
                    <h2 style={{ margin: '0 0 12px 0', fontSize: '28px', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>Choisissez votre forfait</h2>
                    <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-secondary)' }}>
                        {isHardLock ? "Votre période d'essai est terminée. Choisissez un plan pour continuer." : "Débloquez toute la puissance de STACK pour votre salon."}
                    </p>

                    {/* Toggle Annuel / Mensuel */}
                    <div style={{ display: 'inline-flex', background: 'var(--bg-app)', padding: '4px', borderRadius: '24px', marginTop: '24px', border: '1px solid var(--border-color)' }}>
                        <button onClick={() => setIsAnnuel(false)} style={{ background: !isAnnuel ? 'var(--bg-card)' : 'transparent', color: !isAnnuel ? 'var(--text-main)' : 'var(--text-secondary)', border: 'none', padding: '8px 24px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', boxShadow: !isAnnuel ? 'var(--shadow-sm)' : 'none', transition: 'all 0.2s' }}>Mensuel</button>
                        <button onClick={() => setIsAnnuel(true)} style={{ background: isAnnuel ? 'var(--bg-card)' : 'transparent', color: isAnnuel ? 'var(--text-main)' : 'var(--text-secondary)', border: 'none', padding: '8px 24px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', boxShadow: isAnnuel ? 'var(--shadow-sm)' : 'none', transition: 'all 0.2s' }}>Annuel <span style={{ color: '#10b981', marginLeft: '4px' }}>-16%</span></button>
                    </div>
                </div>

                {/* Grille Tarifaire */}
                <div style={{ display: 'flex', gap: '16px', padding: '24px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    
                    {/* ESSENTIEL */}
                    <div style={{ flex: '1 1 250px', background: 'var(--bg-app)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--text-main)' }}>Essentiel</h3>
                        <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>Pour les indépendants qui se lancent.</p>
                        <div style={{ fontSize: '32px', fontWeight: '900', color: 'var(--text-main)', marginBottom: '24px' }}>
                            {isAnnuel ? '32.50' : '39.00'} <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>€ /mois</span>
                            {isAnnuel && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'normal', marginTop: '4px' }}>Facturé 390 € par an</div>}
                        </div>
                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px 0', fontSize: '13px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                            <li>✅ Agenda & Caisse</li>
                            <li>✅ Fiches Clients basiques</li>
                            <li>✅ Jusqu'à 100 SMS / mois</li>
                            <li style={{ opacity: 0.5 }}>❌ Programme Fidélité</li>
                            <li style={{ opacity: 0.5 }}>❌ RH & Absences</li>
                            <li style={{ opacity: 0.5 }}>❌ Intelligence Artificielle</li>
                        </ul>
                        <button onClick={() => onSubscribe('ESSENTIEL', isAnnuel ? 'year' : 'month')} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer' }}>Choisir Essentiel</button>
                    </div>

                    {/* PRO */}
                    <div style={{ flex: '1 1 250px', background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', border: '2px solid var(--btn-primary)', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: 'var(--shadow-md)', transform: 'scale(1.02)' }}>
                        <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: 'var(--btn-primary)', color: 'var(--bg-card)', fontSize: '11px', fontWeight: 'bold', padding: '4px 12px', borderRadius: '12px', letterSpacing: '0.05em' }}>LE PLUS POPULAIRE</div>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--text-main)' }}>Pro</h3>
                        <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>Pour fidéliser et développer le salon.</p>
                        <div style={{ fontSize: '32px', fontWeight: '900', color: 'var(--text-main)', marginBottom: '24px' }}>
                            {isAnnuel ? '57.50' : '69.00'} <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>€ /mois</span>
                            {isAnnuel && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'normal', marginTop: '4px' }}>Facturé 690 € par an</div>}
                        </div>
                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px 0', fontSize: '13px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                            <li>✅ <b>Tout le forfait Essentiel</b></li>
                            <li>✅ Fiches Clients avancées</li>
                            <li>✅ Rappels RDV & SMS illimités</li>
                            <li>✅ L'Académie (Protocoles)</li>
                            <li>✅ Programme de Fidélité</li>
                            <li style={{ opacity: 0.5 }}>❌ RH & Absences</li>
                        </ul>
                        <button onClick={() => onSubscribe('PRO', isAnnuel ? 'year' : 'month')} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: 'none', background: 'var(--btn-primary)', color: 'var(--btn-text)', fontWeight: 'bold', cursor: 'pointer' }}>Choisir Pro</button>
                    </div>

                    {/* PREMIUM */}
                    <div style={{ flex: '1 1 250px', background: 'var(--bg-app)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--text-main)' }}>Premium</h3>
                        <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>L'automatisation totale.</p>
                        <div style={{ fontSize: '32px', fontWeight: '900', color: 'var(--text-main)', marginBottom: '24px' }}>
                            {isAnnuel ? '82.50' : '99.00'} <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>€ /mois</span>
                            {isAnnuel && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'normal', marginTop: '4px' }}>Facturé 990 € par an</div>}
                        </div>
                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px 0', fontSize: '13px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                            <li>✅ <b>Tout le forfait Pro</b></li>
                            <li>✅ Gestion RH & Congés</li>
                            <li>✅ Intelligence Artificielle (Mails)</li>
                            <li>✅ Export Comptable Auto</li>
                            <li>✅ Centre d'actions prioritaire</li>
                        </ul>
                        <button onClick={() => onSubscribe('PREMIUM', isAnnuel ? 'year' : 'month')} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer' }}>Choisir Premium</button>
                    </div>

                </div>

                {/* Soft Lock Button */}
                {isSoftLock && (
                    <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid var(--border-color)', background: 'var(--bg-card)', borderRadius: '0 0 24px 24px' }}>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}>
                            Rappelez-le moi plus tard (il vous reste {7 + joursRestants} jour(s) de tolérance)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
