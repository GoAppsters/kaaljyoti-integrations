<?php
/**
 * The zodiac sign icons: the theme, the site's own images from the media
 * library, what reaches the script tag, and the per-block override.
 *
 * @package KaalJyoti\WP
 */

declare(strict_types=1);

namespace KaalJyoti\WP\Tests;

use Brain\Monkey\Functions;
use KaalJyoti\WP\Assets;
use KaalJyoti\WP\Blocks;
use KaalJyoti\WP\Elements;
use KaalJyoti\WP\Settings;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;

#[CoversClass( Settings::class )]
#[CoversClass( Assets::class )]
#[CoversClass( Elements::class )]
final class SignIconsTest extends TestCase {

	/** The tag WordPress prints for the bundle, before our attributes. */
	private const TAG = '<script src="https://example.test/wp-content/plugins/kaaljyoti/assets/widgets/v1.js?ver=0.2.0" id="kaal-jyoti-widgets-js" defer></script>' . "\n";

	/**
	 * A media library: these attachment ids are images, at these URLs.
	 *
	 * @param array<int, string> $images Attachment id to its `medium` URL.
	 */
	private function given_media( array $images ): void {
		Functions\when( 'wp_attachment_is_image' )->alias(
			static fn( $id ): bool => isset( $images[ (int) $id ] )
		);
		Functions\when( 'wp_get_attachment_image_url' )->alias(
			static fn( $id, $size = 'thumbnail' ) => $images[ (int) $id ] ?? false
		);
	}

	/**
	 * A fresh install draws the bundle's own default and has no images.
	 */
	public function test_the_default_is_element_with_no_images(): void {
		$this->given_settings( array() );

		$this->assertSame( 'element', Settings::sign_icons() );
		$this->assertSame( array(), Settings::sign_images() );
		$this->assertNull( Settings::sign_icons_attribute() );
		$this->assertStringNotContainsString( 'data-sign-icons', Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE ) );
	}

	/**
	 * The theme is one of four; anything else keeps what is stored.
	 *
	 * @param mixed  $posted   What the form sent.
	 * @param string $expected What is stored.
	 */
	#[DataProvider( 'posted_themes' )]
	public function test_sanitize_holds_the_theme_to_four_values( $posted, string $expected ): void {
		$this->given_settings( array( 'sign_icons' => 'glyph' ) );
		$this->given_media( array() );

		$this->assertSame( $expected, Settings::sanitize( array( 'sign_icons' => $posted ) )['sign_icons'] );
	}

	/**
	 * The cases for {@see test_sanitize_holds_the_theme_to_four_values()}.
	 *
	 * @return array<string, array{0: mixed, 1: string}>
	 */
	public static function posted_themes(): array {
		return array(
			'element'         => array( 'element', 'element' ),
			'devanagari'      => array( ' Devanagari ', 'devanagari' ),
			'custom'          => array( 'custom', 'custom' ),
			'unknown'         => array( 'emoji', 'glyph' ),
			'markup'          => array( '"><script>', 'glyph' ),
			'not a string'    => array( array( 'element' ), 'glyph' ),
			'a URL template'  => array( 'https://example.test/{sign}.png', 'glyph' ),
			'an empty string' => array( '', 'glyph' ),
		);
	}

	/**
	 * Only attachment ids that are images are kept, under the twelve signs.
	 */
	public function test_sanitize_keeps_only_image_attachments_for_the_twelve_signs(): void {
		$this->given_settings( array() );
		$this->given_media(
			array(
				11 => 'https://example.test/wp-content/uploads/aries-300x300.png',
				12 => 'https://example.test/wp-content/uploads/leo.png',
			)
		);

		$clean = Settings::sanitize(
			array(
				'sign_icons'  => 'custom',
				'sign_images' => array(
					'aries'     => '11',
					'leo'       => ' 12 ',
					'taurus'    => '99',
					'gemini'    => '11abc',
					'cancer'    => '-11',
					'virgo'     => '',
					'ophiuchus' => '12',
					'libra'     => array( 11 ),
				),
			)
		);

		$this->assertSame(
			array(
				'aries' => 11,
				'leo'   => 12,
			),
			$clean['sign_images']
		);
		$this->assertSame( array(), $this->settings_error_codes() );
	}

	/**
	 * A form that did not post the pickers keeps the stored images.
	 */
	public function test_sanitize_keeps_stored_images_when_none_were_posted(): void {
		$this->given_settings( array( 'sign_images' => array( 'pisces' => 7 ) ) );
		$this->given_media( array( 7 => 'https://example.test/p.png' ) );

		$this->assertSame( array( 'pisces' => 7 ), Settings::sanitize( array() )['sign_images'] );
	}

	/**
	 * "Your own images" with none chosen is saved, with a warning that the
	 * default icons are what visitors will see.
	 */
	public function test_custom_without_images_warns(): void {
		$this->given_settings( array() );
		$this->given_media( array() );

		$clean = Settings::sanitize(
			array(
				'sign_icons'  => 'custom',
				'sign_images' => array( 'aries' => '' ),
			)
		);

		$this->assertSame( 'custom', $clean['sign_icons'] );
		$this->assertContains( 'kaal_jyoti_sign_images', $this->settings_error_codes() );
		$this->given_settings( $clean );
		$this->assertNull( Settings::sign_icons_attribute() );
	}

	/**
	 * Which image URLs the widgets may load.
	 *
	 * @param string      $url      The attachment's URL.
	 * @param string|null $expected What is written, or null.
	 */
	#[DataProvider( 'image_urls' )]
	public function test_safe_image_url( string $url, ?string $expected ): void {
		Functions\when( 'home_url' )->justReturn( 'http://localhost:3000' );

		$this->assertSame( $expected, Settings::safe_image_url( $url ) );
	}

	/**
	 * The cases for {@see test_safe_image_url()}.
	 *
	 * @return array<string, array{0: string, 1: string|null}>
	 */
	public static function image_urls(): array {
		return array(
			'https elsewhere'         => array( 'https://cdn.example.com/signs/leo.png', 'https://cdn.example.com/signs/leo.png' ),
			'this site, over http'    => array( 'http://localhost:3000/wp-content/uploads/leo.png', '/wp-content/uploads/leo.png' ),
			'this site, with a query' => array( 'http://localhost:3000/wp-content/uploads/leo.png?v=2', '/wp-content/uploads/leo.png?v=2' ),
			'http elsewhere'          => array( 'http://cdn.example.com/leo.png', null ),
			'same host, other port'   => array( 'http://localhost:8080/leo.png', null ),
			'a quote'                 => array( 'https://cdn.example.com/leo.png" onerror="x', null ),
			'a bracket'               => array( 'https://cdn.example.com/<leo>.png', null ),
			'javascript'              => array( 'javascript:alert(1)', null ),
			'data'                    => array( 'data:image/svg+xml;base64,AAAA', null ),
			'protocol-relative'       => array( '//cdn.example.com/leo.png', null ),
			'empty'                   => array( '', null ),
		);
	}

	/**
	 * A theme other than the default reaches the tag as its name.
	 */
	public function test_a_theme_is_written_on_the_script_tag(): void {
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'sign_icons'      => 'devanagari',
			)
		);

		$this->assertStringContainsString( ' data-sign-icons="devanagari"', Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE ) );
	}

	/**
	 * The site's images reach the tag as an escaped JSON map of sign to URL,
	 * at the size the setting names, the unusable ones left out.
	 */
	public function test_custom_images_are_a_json_map_on_the_script_tag(): void {
		Functions\when( 'home_url' )->justReturn( 'http://localhost:3000' );
		$sizes = array();
		Functions\when( 'wp_attachment_is_image' )->justReturn( true );
		Functions\when( 'wp_get_attachment_image_url' )->alias(
			static function ( $id, $size ) use ( &$sizes ) {
				$sizes[] = $size;

				return array(
					3 => 'http://localhost:3000/wp-content/uploads/aries-300x300.png',
					4 => 'https://cdn.example.com/leo.svg',
					5 => 'http://cdn.example.com/virgo.png',
					6 => 'https://cdn.example.com/x.png?a=1&b=2',
				)[ (int) $id ] ?? false;
			}
		);
		$this->given_settings(
			array(
				'publishable_key' => 'kj_pub_demo',
				'sign_icons'      => 'custom',
				'sign_images'     => array(
					'aries' => 3,
					'leo'   => 4,
					'virgo' => 5,
					'libra' => 6,
				),
			)
		);

		$tag = Assets::script_attributes( self::TAG, Assets::SCRIPT_HANDLE );

		$this->assertSame( array( 'medium', 'medium', 'medium', 'medium' ), $sizes );
		$this->assertSame( 1, preg_match( '/ data-sign-icons="([^"]*)"/', $tag, $match ) );
		$json = json_decode( html_entity_decode( $match[1], ENT_QUOTES ), true );
		$this->assertSame(
			array(
				'aries' => '/wp-content/uploads/aries-300x300.png',
				'leo'   => 'https://cdn.example.com/leo.svg',
				'libra' => 'https://cdn.example.com/x.png?a=1&b=2',
			),
			$json
		);
		// Nothing in the attribute can close it or open a tag.
		$this->assertStringNotContainsString( '<', $match[1] );
		$this->assertStringNotContainsString( '&b', str_replace( '&amp;', '', $match[1] ) );
	}

	/**
	 * With images chosen and another theme as the site's, the map carries
	 * both: the images for a block set to "the site's own images", the theme
	 * for every other.
	 */
	public function test_images_with_another_theme_carry_the_theme(): void {
		$this->given_media( array( 3 => 'https://cdn.example.com/aries.png' ) );
		$this->given_settings(
			array(
				'sign_icons'  => 'element',
				'sign_images' => array( 'aries' => 3 ),
			)
		);

		$this->assertSame(
			array(
				'aries' => 'https://cdn.example.com/aries.png',
				'theme' => 'element',
			),
			json_decode( (string) Settings::sign_icons_attribute(), true )
		);
	}

	/**
	 * An image deleted from the media library since it was chosen is dropped.
	 */
	public function test_a_deleted_attachment_is_left_out(): void {
		$this->given_media( array( 3 => 'https://cdn.example.com/aries.png' ) );
		$this->given_settings(
			array(
				'sign_icons'  => 'custom',
				'sign_images' => array(
					'aries'  => 3,
					'taurus' => 4,
				),
			)
		);

		$this->assertSame( array( 'aries' => 'https://cdn.example.com/aries.png' ), Settings::sign_image_urls() );
	}

	/**
	 * A stored theme the plugin does not know reads as the default.
	 */
	public function test_an_unknown_stored_theme_reads_as_element(): void {
		$this->given_settings( array( 'sign_icons' => '"><script>' ) );

		$this->assertSame( 'element', Settings::sign_icons() );
		$this->assertNull( Settings::sign_icons_attribute() );
	}

	/**
	 * A block or shortcode on an element that shows signs may pick its own
	 * theme; nothing else is written, and the others do not take it.
	 */
	public function test_elements_take_a_sign_icon_theme_where_they_show_signs(): void {
		$this->given_settings( array( 'publishable_key' => 'kj_pub_demo' ) );

		$this->assertSame( 'glyph', Elements::attributes( 'horoscope', array( 'sign-icons' => ' Glyph ' ) )['sign-icons'] );
		$this->assertSame( 'custom', Elements::attributes( 'transits', array( 'sign-icons' => 'custom' ) )['sign-icons'] );
		$this->assertArrayNotHasKey( 'sign-icons', Elements::attributes( 'lagna', array( 'sign-icons' => 'https://x.test/{sign}.png' ) ) );
		$this->assertArrayNotHasKey( 'sign-icons', Elements::attributes( 'panchang', array( 'sign-icons' => 'glyph' ) ) );
		$this->assertStringContainsString( 'sign-icons="devanagari"', Elements::render( 'kundli-form', array( 'sign-icons' => 'devanagari' ) ) );

		foreach ( Elements::SIGN_ELEMENTS as $element ) {
			$this->assertContains( 'sign-icons', Elements::whitelist( $element ), $element );
		}
	}

	/**
	 * The editor's Display panel offers the four themes and the site default.
	 */
	public function test_the_editor_offers_the_themes(): void {
		$this->given_settings( array() );

		$values = array_column( Blocks::editor_data()['signIcons'], 'value' );

		$this->assertSame( array( '', 'element', 'glyph', 'devanagari', 'custom' ), $values );
		$this->assertArrayHasKey( 'signIconsHelp', Blocks::editor_data()['i18n'] );
	}
}
