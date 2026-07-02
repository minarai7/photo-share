export type ApiErrorResponse = {
    error: {
        code: string;
        message: string;
    };
};

export type UserResponse = {
    id: number;
    username: string;
    email: string;
    created_at: string;
};

export type SignupRequest = {
    username: string;
    email: string;
    password: string;
};

export type LoginRequest = {
    email: string;
    password: string;
};

export type LoginResponse = {
    token: string;
    user: UserResponse;
};


