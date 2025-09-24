import LocalAuthService from "./localAuth.service";


const local = new LocalAuthService();

class AuthService {
    private readonly local: LocalAuthService;

    // Permite inyectar un mock o una variante en tests
    constructor(deps?: { local?: LocalAuthService }) {
        this.local = deps?.local ?? new LocalAuthService();
    }

    async login(email: string, password: string) {
        return this.local.login(email, password);
    }

    async refresh(refresh_token: string) {
        return this.local.refresh(refresh_token);
    }

    async me(user_id: string) {
        return this.local.me(user_id);
    }

    async logout(refresh_token: string) {
        return this.local.logout(refresh_token);
    }

    async logoutAll(user_id: string) {
        return this.local.logoutAll(user_id);
    }
}
export default AuthService;
