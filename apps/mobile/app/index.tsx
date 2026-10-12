import { Redirect } from 'expo-router';
import { useSession } from '../lib/session';
export default function Index() {
  const { account } = useSession();
  return <Redirect href={account ? '/home' : '/welcome'} />;
}
