/* tslint:disable */
/* eslint-disable */
/**
 * HumanLayer Daemon REST API
 * REST API for HumanLayer daemon operations, providing session management, approval workflows, and real-time event streaming capabilities.
 *
 * The version of the OpenAPI document: 1.0.0
 *
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

import { mapValues } from '../runtime';
import type { Session } from './Session';
import {
    SessionFromJSON,
    SessionFromJSONTyped,
    SessionToJSON,
    SessionToJSONTyped,
} from './Session';

/**
 *
 * @export
 * @interface SessionResponse
 */
export interface SessionResponse {
    /**
     *
     * @type {Session}
     * @memberof SessionResponse
     */
    data: Session;
}

/**
 * Check if a given object implements the SessionResponse interface.
 */
export function instanceOfSessionResponse(value: object): value is SessionResponse {
    if (!('data' in value) || value['data'] === undefined) return false;
    return true;
}

export function SessionResponseFromJSON(json: any): SessionResponse {
    return SessionResponseFromJSONTyped(json, false);
}

export function SessionResponseFromJSONTyped(json: any, ignoreDiscriminator: boolean): SessionResponse {
    if (json == null) {
        return json;
    }
    return {

        'data': SessionFromJSON(json['data']),
    };
}

export function SessionResponseToJSON(json: any): SessionResponse {
    return SessionResponseToJSONTyped(json, false);
}

export function SessionResponseToJSONTyped(value?: SessionResponse | null, ignoreDiscriminator: boolean = false): any {
    if (value == null) {
        return value;
    }

    return {

        'data': SessionToJSON(value['data']),
    };
}
