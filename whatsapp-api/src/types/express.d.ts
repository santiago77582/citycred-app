declare global {
  namespace Express {
    interface Request {
      adminUser?: {
        userId: string | null;
        email: string | null;
        displayName: string;
        role: 'ADMIN' | 'SUPERVISOR' | 'ADVISOR';
        emergency: boolean;
      };
    }
  }
}

export {};
