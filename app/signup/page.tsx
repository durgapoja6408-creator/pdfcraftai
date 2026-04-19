import { redirect } from "next/navigation";

/**
 * /signup is the commonly-linked friendly slug. The canonical auth route is
 * /register (where the AuthShell + RegisterForm live); redirect server-side
 * so marketing links don't 404.
 */
export default function SignupAlias() {
  redirect("/register");
}
