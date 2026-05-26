import { useState, useEffect } from 'react';
import { auth, db } from '../firebase/clientApp';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  User as FirebaseUser,
  updateProfile,
  signInWithCustomToken
} from 'firebase/auth';
import { doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { UserProfile } from '../types';

export const useAuth = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Fetch or create Firestore user profile
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          setProfile(userSnap.data() as UserProfile);
        } else {
          // Fallback create profile if missing in Firestore
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || '서면 나들이객',
            phoneNumber: firebaseUser.phoneNumber || '',
            createdAt: Timestamp.now()
          };
          await setDoc(userRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Custom Token Auth: login using a custom token from Kakao login callback
  const loginWithKakaoCustomToken = async (customToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const userCredential = await signInWithCustomToken(auth, customToken);
      return userCredential.user;
    } catch (err: unknown) {
      const error = err as { message?: string };
      console.error('Kakao custom token login error:', err);
      setError(error.message || '카카오 로그인 처리 중 오류가 발생했습니다.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Hybrid Auth Helper: Tries to sign in, if user not found, registers automatically!
  const loginOrRegister = async (email: string, pass: string, name?: string) => {
    setLoading(true);
    setError(null);
    try {
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, pass);
      } catch (signInErr: unknown) {
        const error = signInErr as { code?: string; message?: string };
        // User not found error code: auth/user-not-found
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
          // Register dynamic new user
          userCredential = await createUserWithEmailAndPassword(auth, email, pass);
          if (userCredential.user) {
            await updateProfile(userCredential.user, {
              displayName: name || '서면 나들이객'
            });
            // Profile will be auto-generated in onAuthStateChanged effect
          }
        } else {
          throw signInErr;
        }
      }
      return userCredential?.user;
    } catch (err: unknown) {
      const error = err as { message?: string };
      console.error('Auth action error:', err);
      setError(error.message || '인증 오류가 발생했습니다.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await firebaseSignOut(auth);
    } catch (err: unknown) {
      console.error('Logout error:', err);
    } finally {
      setLoading(false);
    }
  };

  return {
    user,
    profile,
    loading,
    error,
    loginOrRegister,
    loginWithKakaoCustomToken,
    logout
  };
};
