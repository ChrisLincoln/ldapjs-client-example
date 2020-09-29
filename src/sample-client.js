const ldap = require('ldapjs');

// This code works with the ULTRAX AD server
// The following ENV settings are for the the MOCK ldap server
// To get this code to run on the ULTRAX AD server, obtain
// the correct settings for all of the following from IT
// and store them in the environment (using a method of your choosing).

const ldapServer = process.env.LDAP_SERVER || 'ldap://localhost:1389';
const ldapUser = process.env.LDAP_USER || 'root';
const ldapPassword = process.env.LDAP_PASSWORD || 'secret';
const ldapFilter = process.env.LDAP_FILTER || '(email=*@ultraxinc.com)'
const ldapSearchBase = process.env.LDAP_SEARCH_BASE || 'o=testultrax'
const ldapUserNameField = process.env.LDAP_USERNAME_FIELD || 'samaccountname'
const ldapAuthDN = process.env.LDAP_AUTH_DN || 'cn=%USERNAME%, o=testultrax'

function listUsers() {
  const client = ldap.createClient({
    url: ldapServer,
  });
  return new Promise(function(resolve, reject) {
    client.bind(ldapUser, ldapPassword, function(err) {
      if (err) reject(err);
      client.search(
        ldapSearchBase,
        {
          filter: ldapFilter,
          scope: 'sub',
          attributes: ['samaccountname', 'cn', 'givenname', 'sn', 'mail'],
        },
        (err, searchObject) => {
          const users = [];
          if (err) reject(err);
          searchObject.on('searchEntry', function(entry) {
            //console.log(entry.object)
            users.push(entry.object);
          });
          searchObject.on('error', function(err) {
            console.log('error')
            reject(err.message);
          });
          searchObject.on('end', function() {
            resolve(
              users.map(user => ({
                fullName: user.cn,
                username: user[ldapUserNameField],
                email: user.mail,
                firstName: user.givenName || user.givenname,
                lastName: user.sn,
              })).filter(user => {
                return (user.email && user.fullName.match(/\s/) && user.firstName && user.lastName)
              }).sort((a,b) => a.fullName < b.fullName ? -1: 1),
            );
          });
        },
      );
    });
  }).then((response) => {
    client.unbind();
    return response;
  }).catch(e => console.log(e));
}

function authenticateUser(username, password) {
  const client = ldap.createClient({
    url: ldapServer,
  });
  return new Promise(function(resolve, reject) {
    const dn = ldapAuthDN.replace('%USERNAME%', username)
    client.bind(dn, password, function(err) {
      if (err) reject(err);
      resolve('ok');
    });
  }).then((response) => {
    client.unbind();
    return response;
  });
}

(async function() {
  try {
    const users = await listUsers();
    const isOk = await authenticateUser('clincoln', '123');
    console.log(users, isOk)
    
    console.log(process.argv)
  } catch(error) {
    console.log(error)
  }
  
})();
