const url = new URL(window.location)
const get_param = (param) => url.searchParams.get(param)
const get_json_param = (param) => JSON.parse(decodeURIComponent(get_param(param)))

const set_param = (param, value) => url.searchParams.set(param, value)
const set_json_param = (param, value) => set_param(param, encodeURIComponent(JSON.stringify(value)))