import React from 'react';

export const getInitials = (name) => {
  if (!name) return '??';
  const parts = name.trim().split(' ');
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

export const Avatar = ({ url, name, size = 40 }) => {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          border: '1px solid var(--border-color)'
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--btn-primary)',
        color: 'var(--btn-text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 'bold',
        flexShrink: 0,
        border: '1px solid var(--border-color)'
      }}
    >
      {getInitials(name || 'Inconnu')}
    </div>
  );
};

export const renderAvatar = (url, name, size = 40) => (
  <Avatar url={url} name={name} size={size} />
);

export default Avatar;
