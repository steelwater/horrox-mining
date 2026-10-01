import metadata from '../../package.json'

export const build = { version: metadata.version, milestone: metadata.milestone }
export const buildLabel = `V${build.version} / MILESTONE ${build.milestone} - Post-Milestone 3 Operations Flow & Chatter Polish`
