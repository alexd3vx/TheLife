import { useAuth } from "./auth/AuthProvider";
import { AuthPage } from "./ui/AuthPage";
import { HomePlaceholder } from "./ui/HomePlaceholder";

export function App() {
  const { status } = useAuth();

  if (status === "loading") {
    return <div className="splash" role="status" aria-label="Loading" />;
  }
  return status === "inGame" ? <HomePlaceholder /> : <AuthPage />;
}
