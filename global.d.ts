declare global {
	namespace NodeJS {
		interface ProcessEnv {
			AWS_EXECUTION_ENV: string;
			IS_LOCAL: string;
		}
	}
}

export {};
