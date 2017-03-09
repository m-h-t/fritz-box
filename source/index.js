// region import

import cheerio from 'cheerio'
import request from 'superagent'

// internal
import {md5} from './crypto'
import {onify, reduceString} from './utilities'

// endregion

/**
 * @description main class
 */
export default class FritzBoxAPI {

	constructor ({host, password, username}) {
		Object.assign(this, {
			host,
			password,
			username
		})
	}

	/**
	 * @description FRITZ!Box wants this format (md5 encoding is ucs-2):
	 * response = challenge + '-' + md5.hex(challenge + '-' + password)
	 */
	async getSession () {
		let index

		try {
			index = await request
				.get(this.api('/'))
		} catch (error) {
			throw new Error(`could not GET ${this.api('/')}`)
		}

		// get challenge
		const matches = index.text.match(/"challenge":\s*"(.+?)",/);
		const challenge = matches
			? matches[1]
			: null;
		if (!challenge) throw (new Error('Unable to decode challenge'));

		// solve challenge & attempt sign-in
		try {
			const signIn = await request
				.post(this.api('/'))
				.type('form')
				.send({
					response: `${challenge}-${md5(`${challenge}-${reduceString(this.password)}`)}`,
					username: this.username
				})

			// get sessionID
			const start = signIn.text.indexOf('?sid=');
			const stop = signIn.text.indexOf('&', start);
			return this.sessionID = signIn.text.substring(start + 5, stop)
		} catch (error) {
			throw new Error(`could not get session`)
		}
	}

	/**
	 * @description retrieves guest WLAN settings
	 */
	async getGuestWLAN () {
		try {
			const response = await request
				.post(this.api('/data.lua'))
				.type('form')
				.send({
					sid: this.sessionID,
					page: 'wGuest'
				})
			const $ = cheerio.load(response.text);
			return {
				ssid: $('#uiViewGuestSsid').val(),
				key: $('#uiViewWpaKey').val(),
				active: $('#uiViewActivateGuestAccess').is(':checked'),
				limited: $('#uiGroupAccess').is(':checked'),
				terms: $('#uiUntrusted').is(':checked'),
				allowCommunication: $('#uiUiUserIsolation').is(':checked'),
				autoDisable: $('#uiViewDownTimeActiv').is(':checked'),
				waitForLastGuest: $('#uiViewDisconnectGuestAccess').is(':checked'),
				deactivateAfter: $('#uiViewDownTime').val(),
				security: $('#uiSecMode').val()
			}
		} catch (error) {
			throw new Error('Could not get guest WLAN')
		}
	}

	/**
	 * @description saves guest WLAN settings
	 */
	async setGuestWLAN ({ssid, key, active, limited, terms, allowCommunication, autoDisable, waitForLastGuest, deactivateAfter, security}) {
		const template = {
			sid: this.sessionID,
			xhr: 1,
			lang: 'de',
			no_sidrenew: '',
			autoupdate: 'on',
			apply: '',
			oldpage: '/wlan/guest_access.lua'
		}
		try {
			const response = await request
				.post(this.api('/data.lua'))
				.type('form')
				.send(template)
				.send({
					activate_guest_access: onify(active),
					guest_ssid: ssid,
					sec_mode: security,
					wpa_key: key,
					down_time_activ: onify(autoDisable),
					down_time_value: deactivateAfter,
					disconnect_guest_access: onify(waitForLastGuest),
				})

			if (!active) {
				// deactivate guest WLAN
				await request
					.post(this.api('/data.lua'))
					.type('form')
					.send(template)
			}
		} catch (error) {
			throw new Error('Could not set guest WLAN')
		}
	}

	async overview () {
		try {
			const response = await request
				.post(this.api('/data.lua'))
				.type('form')
				.send({
					sid: this.sessionID,
					xhr: 1,
					lang: 'de',
					page: 'overview',
					type: 'all',
					no_sidrenew: ''
				})

			return JSON.parse(response.text)
		} catch (error) {
			throw new Error('Could not get overview')
		}
	}

	api (endpoint) {
		return `http://${this.host}${endpoint}`;
	}

}