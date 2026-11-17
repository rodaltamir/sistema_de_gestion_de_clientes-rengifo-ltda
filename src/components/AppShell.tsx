'use client';

import React, { useState } from 'react';
import AuthScreen from './AuthScreen';
import ClientDashboard from './ClientDashboard';
import type { User } from '@/lib/types';

interface AppShellProps {
  initialUser: User | null;
  initialHasUsers: boolean;
}

export default function AppShell({ initialUser, initialHasUsers }: AppShellProps) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [hasUsers, setHasUsers] = useState<boolean>(initialHasUsers);

  if (!user) {
    return (
      <AuthScreen
        initialHasUsers={hasUsers}
        onAuthenticated={(u) => {
          setHasUsers(true);
          setUser(u);
        }}
      />
    );
  }

  return (
    <ClientDashboard
      user={user}
      onLoggedOut={() => {
        setUser(null);
        setHasUsers(true);
      }}
    />
  );
}
