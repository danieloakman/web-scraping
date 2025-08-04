import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { StatusCodes } from 'http-status-codes';
import * as Z from 'zod';

export function parseBody<T extends Z.ZodTypeAny>(
	evt: APIGatewayProxyEventV2,
	schema: T
): Z.ZodSafeParseResult<Z.infer<T>> {
	if (typeof evt.body !== 'string' || !evt.body.length) return schema.safeParse(evt.body);
	if (evt.isBase64Encoded)
		return schema.safeParse(JSON.parse(Buffer.from(evt.body, 'base64').toString('utf-8')));
	return schema.safeParse(JSON.parse(evt.body));
}

/** What SST interfaces with. */
export interface LambdaFnHandler {
	(evt: APIGatewayProxyEventV2): Promise<{ statusCode: number; body: string }>;
}

export interface LambdaFn<T extends Z.ZodTypeAny, U> {
	(body: Z.output<T>): Promise<U>;
	handler: LambdaFnHandler;
	bodySchema: T;
}

export function lambdaFn<T extends Z.ZodTypeAny, U>(
	bodySchema: T,
	fn: (body: Z.output<T>) => Promise<U>
): LambdaFn<T, U> {
	const handler = async (evt: APIGatewayProxyEventV2) => {
		const body = parseBody(evt, bodySchema);
		if (!body.success)
			return {
				statusCode: StatusCodes.BAD_REQUEST,
				body: 'Invalid body ' + body.error.message
			};

		try {
			const result = await fn(body.data);

			console.debug('Result:', result);

			return {
				statusCode: StatusCodes.OK,
				body: JSON.stringify(result)
			};
		} catch (err) {
			if (err instanceof Error) console.error(err.stack);

			return {
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
				body: err instanceof Error ? err.message : 'Unknown error'
			};
		}
	};
	return Object.assign(fn, { handler, bodySchema });
}
