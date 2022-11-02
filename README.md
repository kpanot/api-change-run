# Api Change Run

Listen an URL change and trigger a command run on change.

## Install

Setup the `api-change-run` package as devDependencies:

```bash
# NPM:
npm install --save-dev api-change-run

# NPM:
yarn add --dev api-change-run
```

## api-change-poll

The `api-change-poll` CLI is polling a given URL to detect changes.
The main purpose is to execute a command when a Rest API response changes.

### Usage

```bash
npx api-change-poll --help

# Usage: api-change-poll [options] <command>

# Execute commands on API change

# Arguments:
#   command              Command to execute.

# Options:
#   -V, --version        output the version number
#   -u, --uri <URI>      URL to the API to watch
#   -d --delay <number>  Delay between polling in second (default: 200)
#   --cwd <path>         Current working directory (default: process.cwd())
#   -i, --init           Trigger a run on the initial connection (default: false)
#   -s --script          Indicate that the given argument is a script that need to be run with npm (or yarn) (default: false)
#   -v, --verbose        Current working directory (default: false)
#   -h, --help           Display help for command
```

### Command

The command will be executed via Node child process.

The response content of the call can be referred in the command via the template string `${RESPONSE}` as following:

```powershell
npx api-change-poll --uri http://localhost/api "echo 'the response `${RESPONSE}'"
```

If the options `--script` is provided, the command will be handle as NPM script and will will be executed with `npm run <command>` (or `yarn run <command>`).

```powershell
npx api-change-poll --uri http://localhost/api --script test
# will execute `npm run test`

yarn api-change-poll --uri http://localhost/api --script test
# will execute `yarn run test`
```
