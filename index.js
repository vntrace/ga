var qs = require('qs');
var _ = require('underscore');
var request = require('request');

var GA_HOST = "www.google-analytics.com";
var GA_GIF = "/__utm.gif";

/*Default query object parameters*/
var defaultQs = {
	"utmac": "",
	"utmwv" : "5.4.3", // GA version
	"utmcs" : "UTF-8",// charset
	"utmul" : "en-us" // language
};

var randomId = function() {
	return Math.floor(Math.random() * Date.now().toString(8));
};

/* 
 * Domain hash string
 * @copy from ga.js
 */
var hash = function(d){
    var a=1,c=0,h,o;
    if(d){
        a=0;
        for(h=d["length"]-1;h>=0;h--){
            o=d.charCodeAt(h);
            a=(a<<6&268435455)+o+(o<<14);
            c=a&266338304;
            a=c!==0?a^c>>21:a;
        }
    }
    return a;
};

/*
 * Analytics Cookie string
 * @params
 *	{String} source
 *	{String} medium
 *	{String} path
 * @return {String}
 */
var cookieString = function(params) {
	var domainHash = hash(params.host);
	var time = Date.now();

	//var __utma = "(domain hash).(random).(time initial).(time previous).(time current).(session count)";
	//var __utmb = "(domain hash).4.10.(time)"
	//var __utmc = "(domain hash)"
	//var __utmz = "(domain hash).(time).(session count).(campaign count).utmcsr=(direct)|utmccn=(direct)|utmcmd=(none)"
	//var __utmv = "(domain hash).(setvar value)"

	var random = hash(params.visitId);
	var initialTime = params.initialTime;
	var lastTime = params.lastTime;

	var utma = domainHash + "." + random + "." + initialTime + "." + lastTime + "." + time + ".1";
	var utmb = domainHash + "." + "4.10" + "." + lastTime;
	var utmc = domainHash;
	var utmz = domainHash + "." +
				time + ".1.1.";

	utmcsr = typeof params.utm_source === "undefined" ? params.source : params.utm_source;
	utmccn = typeof params.utm_campaign === "undefined" ? "direct" : params.utm_campaign;
	utmcmd = typeof params.utm_medium === "undefined" ? params.medium : params.utm_medium;

	utmcsr = utmcsr === "direct" ? "(direct)" : utmcsr;
	utmcmd = utmcmd === "none" ? "(none)" : utmcmd;
	utmccn = "(" + utmccn + ")";

	utmz += "utmcsr=" + utmcsr;
	utmz += "|utmccn=" + utmccn;
	utmz += "|utmcmd=" + utmcmd;

	if(typeof params.utm_content !== "undefined") {
		utmz += "|utmcct=" + params.utm_content;
	}

	if(typeof params.utm_term !== "undefined") {
		utmz += "|utmctr=" + params.utm_term;
	}
	
	return "__utma=" + utma + ";+__utmz=" + utmz + ";+__utmb=" + utmb + ";+__utmc=" + utmc;
};

exports.initialize = function(utmac, domain, callback) {
	defaultQs = _.extend(defaultQs, {
		utmac: utmac,
		utmhn: domain
	});

	return callback();
};

/*
 * Main tracking function
 * @params
 *	{String} type : custom event
 *	{Object} params : tracking params
 *	{void} callback
 */
exports.tracking = function(type, params, callback) {
	/*
	 * Require initialize module first
	 */
	if(typeof defaultQs.utmac === "undefined") {
		return new Error("Google Analytics ID is undefined");
	}

	/*
	 * Self callback function
	 */
	if(typeof callback !== "function") {
		callback = function() {};
	}

	/*
	 * Filter google bot
	 */
	if(typeof params.userAgent !== "undefined") {
		if(params.userAgent.indexOf('Googlebot') !== -1) {
			return false;
		}

		if(params.userAgent.indexOf('Google Web Preview') !== -1) {
			return false;
		}
	}

	/*
	 * Tracking params
	 */
	defaultQs = _.extend(defaultQs, {
		utmcc: cookieString({
			host: defaultQs.utmhn,
			source: params.source,
			medium: params.medium,
			path: params.path,
			utm_source: params.utm_source,
			utm_medium: params.utm_medium,
			utm_campaign: params.utm_campaign,
			utm_term: params.utm_term,
			utm_content: params.utm_content,
			visitId: params.visitId,
			lastTime: params.lastTime,
			initialTime: params.initialTime
		}),
		utmip: params.ip.substr(0, params.ip.lastIndexOf('.')) + '.0',
		utmul: params.userLanguage,
		utmn: randomId(),
		utmni: !params.isNew, // Non-interaction event | --> bounce rate data
		utms: params.utms,
		utmdt: params.title,
		utmr:  (params.source === 'direct') ? '-' : params.source,
		utmp: params.page
	});

	switch(type)
	{
		case 'event':
			doEvent(params, callback);
			break;
		case 'pageView':
			doPageView(params, callback);
			break;
		default:
			// Nothing
			break;
	}
};

var getTrackingEvent = function(category, action, label, value) {
	var pattern = '5(__category__*__action__*__label__) (__value__)';
		pattern = pattern.replace('__category__', category);
		pattern = pattern.replace('__action__', action);
		pattern = pattern.replace('__label__', label);
		pattern = pattern.replace('__value__', value);

	return pattern;
};

/**
 * Trigger event tracking to GA
 * @params
 *		{String} params : tracking param
 *		{void} callback : callback function
 */
var doEvent = function(params, callback) {
	/*
	 * Request params
	 */
	params = _.extend(defaultQs, {
		utmt: event,
		utme: getTrackingEvent('PageView', 'View', params.title, 0)
	});

	doRequest(params, callback);
};

var doPageView = function(params, callback) {
	/*
	 * Default params
	 */
	params = _.extend(defaultQs, {});

	doRequest(params, callback);
};

var doRequest = function(params, callback) {
	/*
	 * Request url
	 */
	var url = 'http://' + GA_HOST + GA_GIF + '?' + qs.stringify(params);

	/*Logging ga request url*/
	// console.log(url);

	/*
	 * Do request
	 */
	request({
		uri: url,
		headers: {
			'User-Agent': params.userAgent, // Header field is case sensitive -- shjt,
			'X-Forwarded-For': params.ip
		}
	}, function(error, response, body) {
		if(!error && response.statusCode == 200) {
			callback(body);
		} else {
			console.log('GA ERROR', url);
		}
	});
};

/**
 * Docs
 * http://www.martynj.com/google-analytics-cookies-tracking-multiple-domains-filters
 */